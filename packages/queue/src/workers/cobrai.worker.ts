import { Worker, type Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { sendWhatsAppResponse } from '../../../../apps/api/src/adapters/whatsapp/message-sender.service';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { cobrancaLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import { svixEvents } from '../../../../apps/api/src/adapters/webhooks/svix.service';
import { isEmergencyStopped } from '../../../../apps/api/src/domain/atendimento/emergency-stop.service';

export interface CobraiJobData {
  tenantId: string;
  customerId: string;
  invoiceId: string;
  ruleId?: string;
  action?: 'send_message' | 'suspend_signal' | 'reactivate' | 'notify_human';
  customerPhone?: string;
  messageContent?: string;
  amountCents?: number;
  // IA-26 — multi-armed bandit (opcional; só ativo se BANDIT_ENABLED=true).
  // Sem campaignKey, o worker usa a messageContent original (fail-open).
  campaignKey?: string;
  // Vars originais usados na interpolação do messageContent. Necessários para
  // re-interpolar a variante sorteada. Se ausentes, a variante vai "crua".
  messageVars?: Record<string, string | number>;
}

export async function executeCobraiAction(job: Job<CobraiJobData>): Promise<void> {
  const { tenantId, customerId, invoiceId, ruleId, action, customerPhone, messageContent, amountCents } = job.data;

  // Lockout: suspender tenant por inadimplência do próprio ISP com a Astrum
  if (job.name === 'lockout_tenant') {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('billing_status')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenant?.billing_status === 'overdue') {
      await supabaseAdmin
        .from('tenants')
        .update({ status: 'suspended', suspended_reason: 'billing_overdue' })
        .eq('id', tenantId);

      await supabaseAdmin
        .from('users')
        .update({ refresh_token_revoked_at: new Date().toISOString() })
        .eq('tenant_id', tenantId);

      cobrancaLogger.info({ tenantId }, 'Tenant suspenso por inadimplência (lockout_tenant)');
    }
    return;
  }

  // Se for evento do outbox (invoice.paid)
  if (job.name === 'invoice.paid') {
    cobrancaLogger.info({ tenantId, invoiceId }, 'Processando evento de pagamento via Outbox');
    
    // reativar cliente se necessário
    if (customerId) {
        await supabaseAdmin
          .from('customers')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', customerId)
          .eq('tenant_id', tenantId);
    }
    
    await svixEvents.invoicePaid(tenantId, {
      invoiceId, customerId, amountCents, paidAt: new Date().toISOString(),
    });
    
    const { wsPublisher } = await import('../../../../apps/api/src/domain/realtime/websocket.routes');
    await wsPublisher.paymentReceived(tenantId, invoiceId, amountCents ?? 0);
    return;
  }

  // Verificar se a fatura ainda está em aberto (pode ter sido paga durante o delay)
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();

  if (!invoice || invoice.status === 'paid') {
    cobrancaLogger.info(
      { tenantId, invoiceId, action },
      'CobrAI job cancelado — fatura já foi paga'
    );
    return;
  }

  if (invoice.status === 'cancelled') {
    cobrancaLogger.info({ tenantId, invoiceId }, 'CobrAI job cancelado — fatura cancelada');
    return;
  }

  // Guardas portadas do legado (S76): janela, limites, opt-out, acordo, compensação.
  if (action === 'send_message' || action === 'suspend_signal') {
    // Freio de emergência da cobrança (C1 — Option A): checado ANTES de enviar
    // qualquer mensagem via WhatsApp. Ativo → o job é marcado 'skipped' e nada é
    // enviado, mas o resto do processamento CobrAI (lockout, invoice.paid,
    // reactivate, notify_human) continua normal — o freio para só o envio.
    const stopped = await isEmergencyStopped({
      findActive: async () => {
        const { data, error } = await supabaseAdmin
          .from('cobranca_emergency_stops')
          .select('id, reason, activated_at, activated_by')
          .is('deactivated_at', null)
          .order('activated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data as any;
      },
    });
    if (stopped) {
      cobrancaLogger.warn({ tenantId, invoiceId, action }, '[emergency-stop] CobrAI suspenso — mensagem NÃO enviada');
      await supabaseAdmin
        .from('cobrai_jobs')
        .update({ status: 'skipped', skip_reason: 'emergency_stop', executed_at: new Date().toISOString() })
        .eq('bullmq_job_id', job.id)
        .eq('tenant_id', tenantId);
      return;
    }

    const { evaluateCobraiGate } = await import('../../../../apps/api/src/domain/cobranca/cobrai-guards');
    const { data: tenantCfg } = await supabaseAdmin
      .from('tenants')
      .select('cobrai_window, cobrai_hourly_limit, cobrai_daily_limit, cobrai_stages')
      .eq('id', tenantId)
      .maybeSingle();
    const { count: sentThisHour } = await supabaseAdmin
      .from('cobrai_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'sent')
      .gte('executed_at', new Date(Date.now() - 3600_000).toISOString());

    // Limite diário: contagem REAL das últimas 24h (janela rolante, igual à hora).
    // Só consulta quando o tenant configurou um limite diário — caso contrário
    // pula a query. ANTES isto era `sentToday: 0` hardcoded → withinDailyLimit(0, N)
    // sempre true → o limite diário NUNCA era aplicado, apesar de configurável.
    const dailyLimit = tenantCfg?.cobrai_daily_limit ?? null;
    let sentToday = 0;
    if (dailyLimit != null) {
      const { count } = await supabaseAdmin
        .from('cobrai_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'sent')
        .gte('executed_at', new Date(Date.now() - 24 * 3600_000).toISOString());
      sentToday = count ?? 0;
    }

    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('marketing_opt_in, payment_agreement')
      .eq('id', customerId)
      .maybeSingle();

    let recentPaymentCount = 0;
    if (action === 'suspend_signal') {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600_000).toISOString();
      const { count } = await supabaseAdmin
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', customerId)
        .gte('paid_at', threeDaysAgo)
        .in('status', ['confirmado', 'pendente_compensacao']);
      recentPaymentCount = count ?? 0;
    }

    const gate = evaluateCobraiGate({
      hour: new Date().getHours(),
      window: tenantCfg?.cobrai_window ?? null,
      sentThisHour: sentThisHour ?? 0,
      hourlyLimit: tenantCfg?.cobrai_hourly_limit ?? 30,
      sentToday,
      dailyLimit,
      stage: action ?? 'lembrete',
      stagesConfig: tenantCfg?.cobrai_stages ?? null,
      customerOptedOut: customer?.marketing_opt_in === false,
      paymentAgreement: customer?.payment_agreement ?? null,
      recentPaymentCount,
    });
    if (!gate.allowed) {
      cobrancaLogger.warn({ tenantId, invoiceId, reason: gate.reason }, 'CobrAI bloqueado por guarda');
      await supabaseAdmin.from('cobrai_jobs').update({ status: 'skipped', skip_reason: gate.reason, executed_at: new Date().toISOString() }).eq('bullmq_job_id', job.id).eq('tenant_id', tenantId);
      return;
    }
  }

  cobrancaLogger.info({ tenantId, invoiceId, action }, `Executando CobrAI action: ${action}`);

  switch (action) {
    case 'send_message': {
      if (!customerPhone || !messageContent) {
        cobrancaLogger.warn({ tenantId, invoiceId }, 'send_message sem phone ou message');
        break;
      }
      // IA-26 — multi-armed bandit (Thompson sampling). Fail-open:
      // se a flag estiver off, ou se a campanha não tiver 2+ variantes ativas,
      // ou se qualquer chamada ao Supabase falhar, usamos o messageContent
      // original. Comportamento atual preservado byte a byte no caminho padrão.
      let finalMessage = messageContent;
      if ((job.data as CobraiJobData).campaignKey) {
        const variantKey = (job.data as CobraiJobData).campaignKey;
        try {
          const { isBanditEnabled, tryPickVariant, recordVariantSend, buildMessageFromVariant } =
            await import('../../../../apps/api/src/domain/cobranca/variant-picker.service');
          if (isBanditEnabled()) {
            const picked = await tryPickVariant(tenantId, variantKey!); // já checado truthy na guarda acima
            if (picked) {
              finalMessage = buildMessageFromVariant(
                picked.template,
                (job.data as CobraiJobData).messageVars,
              );
              await recordVariantSend(tenantId, picked.id, invoiceId);
              cobrancaLogger.info(
                { tenantId, invoiceId, campaignKey: variantKey, variantId: picked.id, variantKey: picked.variantKey },
                'CobrAI bandit: variante sorteada',
              );
            }
          }
        } catch (err) {
          cobrancaLogger.warn(
            { err, tenantId, invoiceId, campaignKey: variantKey },
            'CobrAI bandit falhou — usando mensagem original (fail-open)',
          );
        }
      }
      await sendWhatsAppResponse({
        to: customerPhone,
        content: finalMessage,
        tenantId,
      });
      break;
    }

    case 'suspend_signal': {
      // Chamar API de suspensão (implementação depende do MikroTik/Radius do ISP)
      // TODO Sprint 4: integrar com NetBox/SNMP do ISP
      cobrancaLogger.warn({ tenantId, customerId }, 'suspend_signal: integração com MikroTik pendente (Sprint 4)');

      // Por ora: marcar cliente como suspenso no banco
      await supabaseAdmin
        .from('customers')
        .update({ status: 'suspended', updated_at: new Date().toISOString() })
        .eq('id', customerId)
        .eq('tenant_id', tenantId);

      // Notificar cliente via WhatsApp
      if (customerPhone) {
        await sendWhatsAppResponse({
          to: customerPhone,
          content: 'Seu serviço foi temporariamente suspenso por falta de pagamento. Para reativar, regularize sua situação.',
          tenantId,
        });
      }
      break;
    }

    case 'reactivate': {
      await supabaseAdmin
        .from('customers')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', customerId)
        .eq('tenant_id', tenantId);

      cobrancaLogger.info({ tenantId, customerId }, 'Cliente reativado após pagamento');
      break;
    }

    case 'notify_human': {
      // Criar ticket para o operador
      await supabaseAdmin.from('tickets').insert({
        tenant_id: tenantId,
        customer_id: customerId,
        title: `CobrAI: Cliente com fatura ${invoiceId} vencida há mais de 30 dias`,
        description: messageContent ?? 'Ação manual necessária',
        status: 'open',
        priority: 'high',
      });

      cobrancaLogger.info({ tenantId, customerId }, 'Ticket criado para operador (notify_human)');
      break;
    }
  }

  // Atualizar status do job no banco
  await supabaseAdmin
    .from('cobrai_jobs')
    .update({
      status: 'sent',
      executed_at: new Date().toISOString(),
    })
    .eq('bullmq_job_id', job.id)
    .eq('tenant_id', tenantId);
}

export function createCobraiWorker() {
  const worker = new Worker<CobraiJobData>(
    // BUG FIX (Fase 2, 2026-08-16): tinha que ser 'cobrai' — mesmo nome da Queue em
    // priority-queues.ts. Com nomes diferentes, BullMQ nunca conecta Queue->Worker
    // (namespaces de chave Redis distintos): jobs de queues.cobrai.add(...) (send-now,
    // DLQ retry, webhook Asaas) eram enfileirados e NUNCA consumidos, silenciosamente.
    // Não pegou em produção só porque createCobraiWorker() também nunca era chamado
    // (ver server.ts) — os dois bugs se mascaravam.
    'cobrai',
    executeCobraiAction,
    {
      connection: connection as any,
      concurrency: 10, // CobrAI pode processar muitos simultaneamente
    }
  );

  setupDLQ(worker);
  addSentryToWorker(worker, 'cobrai-worker');

  worker.on('completed', (job) => {
    cobrancaLogger.info({ jobId: job.id, action: job.data.action }, 'CobrAI job concluído');
  });

  worker.on('failed', (job, err) => {
    cobrancaLogger.error(
      { jobId: job?.id, action: job?.data?.action, err },
      'CobrAI job falhou'
    );
  });

  return worker;
}
