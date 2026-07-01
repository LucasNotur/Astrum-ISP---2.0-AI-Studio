import { Worker, type Job } from 'bullmq';
import { connection } from '../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../apps/api/src/infrastructure/queue/bullmq.client';
import { sendWhatsAppResponse } from '../../../apps/api/src/adapters/whatsapp/message-sender.service';
import { supabaseAdmin } from '../../../apps/api/src/infrastructure/database/supabase.client';
import { cobrancaLogger } from '../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import { svixEvents } from '../../../apps/api/src/adapters/webhooks/svix.service';
import { shouldBootWorker } from '../../../apps/api/src/infrastructure/config/engine-flags';

export interface CobraiJobData {
  tenantId: string;
  customerId: string;
  invoiceId: string;
  ruleId?: string;
  action?: 'send_message' | 'suspend_signal' | 'reactivate' | 'notify_human';
  customerPhone?: string;
  messageContent?: string;
  amountCents?: number;
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
    
    const { wsPublisher } = await import('../../../apps/api/src/domain/realtime/websocket.routes');
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

  cobrancaLogger.info({ tenantId, invoiceId, action }, `Executando CobrAI action: ${action}`);

  switch (action) {
    case 'send_message': {
      if (!customerPhone || !messageContent) {
        cobrancaLogger.warn({ tenantId, invoiceId }, 'send_message sem phone ou message');
        break;
      }
      await sendWhatsAppResponse({
        to: customerPhone,
        content: messageContent,
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
