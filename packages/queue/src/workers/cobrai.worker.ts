import { Worker, type Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { sendWhatsAppResponse } from '../../../../apps/api/src/adapters/whatsapp/message-sender.service';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { cobrancaLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import { svixEvents } from '../../../../apps/api/src/adapters/webhooks/svix.service';
import { shouldBootWorker } from '../../../../apps/api/src/infrastructure/config/engine-flags';

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

async function executeCobraiAction(job: Job<CobraiJobData>): Promise<void> {
  const { tenantId, customerId, invoiceId, ruleId, action, customerPhone, messageContent, amountCents } = job.data;

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

  // Guardas portadas do legado (S76): janela de horário, limites, opt-out.
  if (action === 'send_message') {
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

    const gate = evaluateCobraiGate({
      hour: new Date().getHours(),
      window: tenantCfg?.cobrai_window ?? null,
      sentThisHour: sentThisHour ?? 0,
      hourlyLimit: tenantCfg?.cobrai_hourly_limit ?? 30,
      sentToday: 0,
      dailyLimit: tenantCfg?.cobrai_daily_limit ?? null,
      stage: (action as string) ?? 'lembrete',
      stagesConfig: tenantCfg?.cobrai_stages ?? null,
    });
    if (!gate.allowed) {
      cobrancaLogger.warn({ tenantId, invoiceId, reason: gate.reason }, 'CobrAI bloqueado por guarda');
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
            const picked = await tryPickVariant(tenantId, variantKey);
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
  // Guarda R6: só sobe se COBRAI_ENGINE=v2. Evita disparo duplo com o worker legado.
  if (!shouldBootWorker('cobrai', 'v2', (m) => cobrancaLogger.warn(m))) {
    return null;
  }

  const worker = new Worker<CobraiJobData>(
    'astrum:cobranca',
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
