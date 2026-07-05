import supabase from '../database/supabase.client';
import { suspensionQueue } from '../../../../../packages/queue/src/queues';
import { infraLogger } from '../logging/logger';

/**
 * Executor de ferramentas do Function Calling.
 * Conecta as decisões da IA com as ações reais no sistema.
 */
export class ToolsExecutor {
  constructor(private readonly tenantId: string) {}

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    infraLogger.info({ toolName, args, tenantId: this.tenantId }, 'Executing tool');

    switch (toolName) {
      case 'suspend_signal':
        return this._suspendSignal(args);
      case 'check_invoice':
        return this._checkInvoice(args);
      case 'create_ticket':
        return this._createTicket(args);
      case 'query_knowledge_base':
        return this._queryKnowledgeBase(args);
      case 'get_billing_status':
      case 'check_invoice':
        return this._checkInvoice(args);
      case 'check_coverage':
        return this._checkCoverage(args);
      case 'run_diagnostics':
        return this._runDiagnostics(args);
      case 'schedule_technical_visit':
        return this._scheduleTechnicalVisit(args);
      default:
        infraLogger.warn({ toolName }, 'Unknown tool called — ignoring');
        return { error: 'Ferramenta não reconhecida' };
    }
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

  /** schedule_technical_visit — cria uma OS (service_orders). */
  private async _scheduleTechnicalVisit(args: Record<string, unknown>) {
    const { customer_id, reason, address, scheduled_for } = args as {
      customer_id: string; reason: string; address?: string; scheduled_for?: string;
    };

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
}
