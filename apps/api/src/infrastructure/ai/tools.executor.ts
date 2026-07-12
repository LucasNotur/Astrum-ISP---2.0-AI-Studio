import supabase from '../database/supabase.client';
import { suspensionQueue } from '../../../../../packages/queue/src/queues';
import { infraLogger } from '../logging/logger';
import { getEnabledTools, recordToolUsage } from './tool-registry';
import { impactoCto, reincidencia, capacidade, defaultDb as graphDb } from '../../domain/rede/network-graph.service';
import { decryptCredentials } from '../../adapters/erp/credential-cipher';
import { createErpProvider, isErpImplemented } from '../../adapters/erp/erp.factory';
import { supportsErpOperations, type ERPProviderName, type ERPCredentials, type ERPProvider } from '../../adapters/erp/erp.types';
import { executeTrustUnlock, defaultTrustUnlockDb } from '../../domain/atendimento/trust-unlock.service';
import { buildNegotiationMenu, defaultNegotiationDb } from '../../domain/atendimento/debt-negotiation.service';
import { checkViability, getAvailablePlans } from '../../domain/vendas/sales-funnel.service';
import { sendContract } from '../../domain/vendas/contract.service';

/**
 * Executor de ferramentas do Function Calling.
 * Conecta as decisões da IA com as ações reais no sistema.
 */
export class ToolsExecutor {
  constructor(private readonly tenantId: string) {}

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    infraLogger.info({ toolName, args, tenantId: this.tenantId }, 'Executing tool');

    // IA-19 — defesa em profundidade: se a tool foi desabilitada pelo provedor
    // na tela /intelligence/tools, o modelo não deveria nem vê-la, mas se
    // vier por cache stale ou prompt injection, recusamos aqui.
    try {
      const enabled = await getEnabledTools(this.tenantId);
      if (!(toolName in enabled)) {
        infraLogger.warn(
          { toolName, tenantId: this.tenantId },
          'Tool desabilitada pelo provedor — recusada no executor',
        );
        const result = { error: 'Ferramenta desativada pelo provedor' };
        recordToolUsage(this.tenantId, toolName, result);
        return result;
      }
    } catch (err) {
      // Fail-open do registry: se o registry falhar, prosseguimos.
      infraLogger.warn({ err: (err as Error).message }, 'tool-registry indisponível no executor');
    }

    let result: unknown;
    switch (toolName) {
      case 'suspend_signal':
        result = await this._suspendSignal(args);
        break;
      case 'check_invoice':
      case 'get_billing_status': // alias documentado (S72)
        result = await this._checkInvoice(args);
        break;
      case 'create_ticket':
        result = await this._createTicket(args);
        break;
      case 'query_knowledge_base':
        result = await this._queryKnowledgeBase(args);
        break;
      case 'check_coverage':
        result = await this._checkCoverage(args);
        break;
      case 'run_diagnostics':
        result = await this._runDiagnostics(args);
        break;
      case 'schedule_technical_visit':
        result = await this._scheduleTechnicalVisit(args);
        break;
      case 'query_network_graph': // IA-16
        result = await this._queryNetworkGraph(args);
        break;
      case 'browse_url': // IA-22
        result = await this._browseUrl(args);
        break;
      case 'trust_unlock': // P1-01
        result = await this._trustUnlock(args);
        break;
      case 'negotiate_debt': // P1-03
        result = await this._negotiateDebt(args);
        break;
      case 'check_viability': // P3-01
        result = await this._checkViability(args);
        break;
      case 'list_plans': // P3-01
        result = await this._listPlans();
        break;
      case 'send_contract': // P3-03
        result = await this._sendContract(args);
        break;
      default:
        infraLogger.warn({ toolName }, 'Unknown tool called — ignoring');
        result = { error: 'Ferramenta não reconhecida' };
    }

    // IA-19 — fire-and-forget: contador de uso 7d. Erros do contador não afetam a resposta.
    recordToolUsage(this.tenantId, toolName, result);
    return result;
  }

  /** P0-06 — instancia o adapter do ERP ativo do tenant (null se não configurado). */
  private async _getErpAdapter(): Promise<ERPProvider | null> {
    const { data: erpCred } = await supabase
      .from('tenant_erp_credentials')
      .select('provider, credentials_encrypted')
      .eq('tenant_id', this.tenantId)
      .eq('active', true)
      .maybeSingle();
    if (!erpCred?.provider || !isErpImplemented(erpCred.provider as ERPProviderName)) return null;
    const creds = decryptCredentials<ERPCredentials>(erpCred.credentials_encrypted);
    return createErpProvider(erpCred.provider as ERPProviderName, creds);
  }

  private async _suspendSignal(args: Record<string, unknown>) {
    const { customer_id, reason, scheduled_for } = args as {
      customer_id: string;
      reason: string;
      scheduled_for?: string;
    };

    // Registrar no audit log ANTES de executar (segurança)
    await supabase.from('audit_log').insert({
      tenant_id: this.tenantId,
      action: 'ai_suspend_signal',
      entity_id: customer_id,
      metadata: { reason, scheduled_for, triggered_by: 'ai_agent' },
    });

    // P0-06 — suspensão imediata direto no ERP quando o conector suporta.
    // Suspensão AGENDADA continua no BullMQ (o delay mora na fila, não no ERP).
    if (!scheduled_for) {
      try {
        const adapter = await this._getErpAdapter();
        if (adapter && supportsErpOperations(adapter)) {
          const r = await adapter.suspendCustomer(customer_id, reason);
          if (r.success) {
            infraLogger.info({ tenantId: this.tenantId, provider: adapter.name }, 'suspend_signal via ERP adapter');
            return { success: true, source: 'erp', message: `Suspensão executada no ERP para ${customer_id}` };
          }
        }
      } catch (erpErr) {
        // Falha silenciosa: cai de volta para a fila local (resiliência).
        infraLogger.warn({ err: (erpErr as Error).message, tenantId: this.tenantId }, 'ERP suspend falhou — usando fila local');
      }
    }

    // Agendar job BullMQ para suspensão
    await suspensionQueue.add('suspend_signal', {
      customerId: customer_id,
      tenantId: this.tenantId,
      reason,
      scheduledFor: scheduled_for,
    }, {
      delay: scheduled_for ? new Date(scheduled_for).getTime() - Date.now() : 0,
      priority: 10, // critical
    });

    return { success: true, message: `Suspensão agendada para ${customer_id}` };
  }

  private async _checkInvoice(args: Record<string, unknown>) {
    const { customer_id, include_overdue_only } = args as {
      customer_id: string;
      include_overdue_only: boolean;
    };

    // P0-06 — se o tenant tem ERP configurado, busca diretamente no ERP do ISP.
    try {
      const { data: erpCred } = await supabase
        .from('tenant_erp_credentials')
        .select('provider, credentials_encrypted')
        .eq('tenant_id', this.tenantId)
        .eq('active', true)
        .maybeSingle();

      if (erpCred?.provider && isErpImplemented(erpCred.provider as ERPProviderName)) {
        const creds = decryptCredentials<ERPCredentials>(erpCred.credentials_encrypted);
        const adapter = createErpProvider(erpCred.provider as ERPProviderName, creds);
        const billingRaw = await adapter.getBillingStatus(customer_id);
        infraLogger.info({ tenantId: this.tenantId, provider: erpCred.provider }, 'check_invoice via ERP adapter');
        return { invoices: billingRaw, source: 'erp' };
      }
    } catch (erpErr) {
      // Falha silenciosa: cai de volta para Supabase (resiliência).
      infraLogger.warn({ err: (erpErr as Error).message, tenantId: this.tenantId }, 'ERP check_invoice falhou — usando Supabase');
    }

    let query = supabase
      .from('invoices')
      // payment_url e pix_copy_paste são CRÍTICOS: é o que a IA envia para 2ª via (S69/gap report).
      .select('id, amount_cents, due_date, status, paid_at, payment_url, pix_copy_paste')
      .eq('customer_id', customer_id)
      .eq('tenant_id', this.tenantId)
      .order('due_date', { ascending: false })
      .limit(5);

    if (include_overdue_only) {
      query = query.eq('status', 'overdue');
    }

    const { data, error } = await query;
    if (error) return { error: 'Erro ao consultar faturas' };

    return { invoices: data };
  }

  /** check_coverage — consulta ocupação de CTOs (rede) num raio/endereço. */
  private async _checkCoverage(args: Record<string, unknown>) {
    const { cto_id } = args as { cto_id?: string };
    let query = supabase
      .from('network_ctos')
      .select('id, name, latitude, longitude, total_ports, used_ports, status')
      .eq('tenant_id', this.tenantId)
      .limit(10);
    if (cto_id) query = query.eq('id', cto_id);

    const { data, error } = await query;
    if (error) return { error: 'Erro ao consultar cobertura' };

    const ctos = (data ?? []).map((c: any) => ({
      ...c,
      available_ports: Math.max(0, (c.total_ports ?? 0) - (c.used_ports ?? 0)),
      has_availability: (c.total_ports ?? 0) - (c.used_ports ?? 0) > 0,
    }));
    return { ctos };
  }

  /** run_diagnostics — teste de sinal/latência. Sem SNMP ainda (S93): resultado simulado marcado. */
  private async _runDiagnostics(args: Record<string, unknown>) {
    const { customer_id } = args as { customer_id: string };
    const { data: customer } = await supabase
      .from('customers')
      .select('id, status')
      .eq('id', customer_id)
      .eq('tenant_id', this.tenantId)
      .maybeSingle();

    if (!customer) return { error: 'Cliente não encontrado' };
    // Suspenso → diagnóstico aponta a causa real antes de "problema técnico".
    if (customer.status === 'suspended') {
      return { signal: 'no_signal', reason: 'account_suspended', simulated: true };
    }
    return { signal: 'ok', latency_ms: 18, packet_loss: 0, simulated: true, note: 'telemetria real chega na S93 (SNMP/TR-069)' };
  }

  /** schedule_technical_visit — cria a OS no ERP (P0-06) ou em service_orders. */
  private async _scheduleTechnicalVisit(args: Record<string, unknown>) {
    const { customer_id, reason, address, scheduled_for } = args as {
      customer_id: string; reason: string; address?: string; scheduled_for?: string;
    };

    // P0-06 — quando o tenant tem conector, a OS mora no ERP (fonte da verdade
    // do técnico). Espelho local em service_orders mantém o mapa/painéis vivos.
    try {
      const adapter = await this._getErpAdapter();
      if (adapter && supportsErpOperations(adapter)) {
        const erpOs = await adapter.createServiceOrder({
          customerId: customer_id,
          description: reason,
          scheduledFor: scheduled_for,
        });
        await supabase.from('service_orders').insert({
          tenant_id: this.tenantId,
          customer_id,
          type: 'technical_visit',
          status: 'open',
          description: reason,
          address: address ?? null,
          scheduled_for: scheduled_for ?? null,
          created_by: 'ai_agent',
          external_id: erpOs.orderId,
        });
        infraLogger.info({ tenantId: this.tenantId, provider: adapter.name, orderId: erpOs.orderId }, 'schedule_technical_visit via ERP adapter');
        return { service_order_id: erpOs.orderId, source: 'erp', success: true };
      }
    } catch (erpErr) {
      infraLogger.warn({ err: (erpErr as Error).message, tenantId: this.tenantId }, 'ERP createServiceOrder falhou — usando service_orders local');
    }

    const { data, error } = await supabase.from('service_orders').insert({
      tenant_id: this.tenantId,
      customer_id,
      type: 'technical_visit',
      status: 'open',
      description: reason,
      address: address ?? null,
      scheduled_for: scheduled_for ?? null,
      created_by: 'ai_agent',
    }).select('id').single();

    if (error) return { error: 'Erro ao agendar visita técnica' };
    return { service_order_id: data.id, success: true };
  }

  private async _createTicket(args: Record<string, unknown>) {
    const { customer_id, title, description, priority, category } = args as {
      customer_id: string;
      title: string;
      description: string;
      priority: string;
      category: string;
    };

    const { data, error } = await supabase.from('tickets').insert({
      tenant_id: this.tenantId,
      customer_id,
      title,
      description,
      priority,
      category,
      status: 'open',
      created_by: 'ai_agent',
    }).select('id').single();

    if (error) return { error: 'Erro ao criar ticket' };
    return { ticket_id: data.id, success: true };
  }

  private async _queryKnowledgeBase(args: Record<string, unknown>) {
    // Delegado ao RAG service — retorna contexto já processado
    const { query } = args as { query: string };
    return { query, message: 'RAG query delegated to rag-query.service' };
  }

  /** IA-16 — GraphRAG leve. Despacha para 1 das 3 consultas nomeadas. */
  private async _queryNetworkGraph(args: Record<string, unknown>) {
    const { mode, cto_id, days } = args as {
      mode: 'impacto_cto' | 'reincidencia' | 'capacidade';
      cto_id?: string;
      days?: number;
    };
    if (mode === 'impacto_cto') {
      if (!cto_id) return { error: 'cto_id é obrigatório para impacto_cto' };
      return await impactoCto(graphDb, this.tenantId, cto_id);
    }
    if (mode === 'reincidencia') {
      return await reincidencia(graphDb, this.tenantId, days ?? 30);
    }
    if (mode === 'capacidade') {
      return await capacidade(graphDb, this.tenantId);
    }
    return { error: `mode inválido: ${mode}` };
  }

  private async _browseUrl(args: Record<string, unknown>) {
    const { browseUrl } = await import('../browse/browser.service');
    return browseUrl(args.url as string, this.tenantId);
  }

  /** P1-01 — Religue por confiança com política por tenant. */
  private async _trustUnlock(args: Record<string, unknown>) {
    const { customer_id, debt_cents } = args as {
      customer_id: string;
      debt_cents: number;
    };
    return executeTrustUnlock(defaultTrustUnlockDb, this.tenantId, customer_id, debt_cents);
  }

  /** P1-03 — Negociação guiada: menu de opções parametrizado pelo tenant. */
  private async _negotiateDebt(args: Record<string, unknown>) {
    const { debt_cents } = args as { debt_cents: number };
    return buildNegotiationMenu(defaultNegotiationDb, this.tenantId, debt_cents);
  }

  /** P3-01 — Verifica viabilidade técnica por endereço. */
  private async _checkViability(args: Record<string, unknown>) {
    const { address } = args as { address: string };
    if (!address) return { error: 'address é obrigatório' };
    return checkViability(this.tenantId, address);
  }

  /** P3-01 — Lista planos disponíveis do tenant (ERP ou Supabase). */
  private async _listPlans() {
    return { plans: await getAvailablePlans(this.tenantId) };
  }

  /** P3-03 — Envia contrato digital para assinatura. */
  private async _sendContract(args: Record<string, unknown>) {
    const { lead_id, signer_name, signer_cpf, signer_email, signer_phone, address, plan_name, plan_price_cents } = args as {
      lead_id: string;
      signer_name: string;
      signer_cpf: string;
      signer_email?: string;
      signer_phone?: string;
      address: string;
      plan_name: string;
      plan_price_cents: number;
    };
    return sendContract({
      tenantId: this.tenantId,
      leadId: lead_id,
      signerName: signer_name,
      signerCpf: signer_cpf,
      signerEmail: signer_email,
      signerPhone: signer_phone,
      address,
      planName: plan_name,
      planPriceCents: plan_price_cents,
    });
  }
}
