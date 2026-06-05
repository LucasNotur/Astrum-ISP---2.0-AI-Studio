import { watchTable } from './realtime.service';
import { messageQueue, cobrancaQueue } from '../../../../../packages/queue/src/queues';
import { atendimentoLogger, cobrancaLogger } from '../logging/logger';

/**
 * Inicializa todos os listeners de Realtime do backend.
 * Chamar no startup do servidor após conexão com o banco.
 */
import { detectAndMaskPII } from '../guardrails/pii-detector.service';
import { scheduleCobraiFlow } from '../../domain/cobranca/cobrai.scheduler';
import { cancelInvoiceCobraiJobs } from '../../domain/cobranca/cobrai-rules.service';

export function initBusinessListeners() {
  // 1. Nova mensagem → enfileirar processamento de IA
  watchTable({
    table: 'messages',
    event: 'INSERT',
    handler: async ({ new: message }: any) => {
      if (message.role !== 'user') return; // ignorar mensagens do bot
      if (message.from_ai) return;

      atendimentoLogger.info(
        { conversationId: message.conversation_id, tenantId: message.tenant_id },
        'Nova mensagem do usuário detectada via Realtime — enfileirando para IA'
      );

      // Antes de adicionar à fila:
      const piiCheck = detectAndMaskPII(message.content);

      await messageQueue.add('process-message', {
        tenantId: message.tenant_id,
        conversationId: message.conversation_id,
        messageContent: piiCheck.maskedText,
        messageId: message.id,
        channel: 'whatsapp',
        originalHasPII: piiCheck.hasPII,
      });
    },
  });

  // 2. Fatura vencida → disparar CobrAI
  watchTable({
    table: 'invoices',
    event: 'UPDATE',
    handler: async ({ new: invoice, old: oldInvoice }: any) => {
      if (oldInvoice.status === invoice.status) return;
      if (invoice.status !== 'overdue') return;

      cobrancaLogger.info(
        { invoiceId: invoice.id, tenantId: invoice.tenant_id, customerId: invoice.customer_id },
        'Fatura marcada como vencida — iniciando régua CobrAI'
      );

      await scheduleCobraiFlow({
        tenantId: invoice.tenant_id,
        customerId: invoice.customer_id,
        invoiceId: invoice.id,
        amountCents: invoice.amount_cents,
        dueDate: new Date(invoice.due_date),
      });
    },
  });

  // Fatura paga → cancelar jobs pendentes
  watchTable({
    table: 'invoices',
    event: 'UPDATE',
    handler: async ({ new: invoice, old: oldInvoice }: any) => {
      if (oldInvoice.status === invoice.status) return;
      if (invoice.status !== 'paid') return;

      cobrancaLogger.info(
        { tenantId: invoice.tenant_id, invoiceId: invoice.id },
        'Fatura paga — cancelando jobs CobrAI pendentes'
      );

      const cancelledIds = await cancelInvoiceCobraiJobs(
        invoice.tenant_id,
        invoice.id
      );

      // Cancelar jobs no BullMQ também
      for (const jobId of cancelledIds) {
        try {
          const job = await cobrancaQueue.getJob(jobId);
          await job?.remove();
        } catch { /* job já executado — ignorar */ }
      }
    },
  });

  // 3. Ticket resolvido pela IA → log de métricas
  watchTable({
    table: 'tickets',
    event: 'UPDATE',
    filter: 'resolved_by_ai=eq.true',
    handler: async ({ new: ticket }: any) => {
      atendimentoLogger.info(
        { ticketId: ticket.id, tenantId: ticket.tenant_id },
        '✅ Ticket resolvido pela IA — computar para métricas de ROI'
      );
      // TODO Sprint 3: enviar para DuckDB analytics
    },
  });

  atendimentoLogger.info('Realtime: 3 listeners de negócio inicializados');
}
