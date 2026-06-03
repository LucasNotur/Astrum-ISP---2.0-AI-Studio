import supabase from '../database/supabase.client';
import { Queue } from 'bullmq';
import { getRedisClient } from '../cache/redis.client';
import { infraLogger } from '../logging/logger';

/**
 * Outbox Pattern
 *
 * BLOCO 6 — Consistência Eventual
 *
 * PROBLEMA que resolve:
 * Sem Outbox: banco debita pagamento → servidor cai → evento nunca vai para BullMQ
 * Com Outbox: banco debita + grava outbox atomicamente → worker lê outbox → publica no BullMQ
 *
 * GARANTIA: é impossível ter o banco atualizado sem o evento correspondente
 *
 * FLUXO:
 * 1. Código grava no banco + grava na tabela `outbox` na mesma transação
 * 2. `OutboxWorker` faz polling a cada 5s
 * 3. Para cada evento não processado → publica no BullMQ correto
 * 4. Marca `processed_at` na tabela outbox
 */

export type OutboxEventType =
  | 'document.uploaded'
  | 'invoice.paid'
  | 'customer.suspended'
  | 'ticket.created'
  | 'ticket.resolved'
  | 'cobrai.scheduled'
  | 'customer.activated';

interface OutboxEvent {
  id: string;
  tenant_id: string;
  event_type: OutboxEventType;
  payload: Record<string, unknown>;
  created_at: string;
  processed_at: string | null;
  retry_count: number;
}

// Mapeamento: tipo de evento → fila BullMQ de destino
const EVENT_QUEUE_MAP: Record<OutboxEventType, string> = {
  'document.uploaded': 'documents',
  'invoice.paid': 'cobrai',
  'customer.suspended': 'notifications',
  'ticket.created': 'notifications',
  'ticket.resolved': 'ai-batch',
  'cobrai.scheduled': 'cobrai',
  'customer.activated': 'notifications',
};

// Mapeamento: tipo de evento → prioridade BullMQ
const EVENT_PRIORITY_MAP: Record<OutboxEventType, number> = {
  'invoice.paid': 10,        // critical
  'customer.suspended': 10,  // critical
  'cobrai.scheduled': 10,    // critical
  'ticket.created': 5,       // normal
  'ticket.resolved': 5,      // normal
  'customer.activated': 5,   // normal
  'document.uploaded': 1,    // batch
};

export class OutboxService {

  /**
   * Publica evento na tabela outbox.
   * Chamar DENTRO da mesma transação do banco que faz a mudança de negócio.
   */
  async publish(
    tenantId: string,
    eventType: OutboxEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await supabase.from('outbox').insert({
      tenant_id: tenantId,
      event_type: eventType,
      payload,
      retry_count: 0,
    });

    if (error) {
      infraLogger.error({ error, tenantId, eventType }, 'Failed to write to outbox');
      throw error;
    }

    infraLogger.debug({ tenantId, eventType }, 'Event written to outbox');
  }

  /**
   * Processa eventos pendentes do outbox.
   * Chamado pelo OutboxWorker a cada 5 segundos.
   */
  async processPending(): Promise<void> {
    const { data: events } = await supabase
      .from('outbox')
      .select('*')
      .is('processed_at', null)
      .lt('retry_count', 5)
      .order('created_at', { ascending: true })
      .limit(50);

    if (!events || events.length === 0) return;

    infraLogger.debug({ count: events.length }, 'Outbox: processing pending events');

    for (const event of events as OutboxEvent[]) {
      await this._processEvent(event);
    }
  }

  private async _processEvent(event: OutboxEvent): Promise<void> {
    const queueName = EVENT_QUEUE_MAP[event.event_type];
    const priority = EVENT_PRIORITY_MAP[event.event_type] ?? 5;

    try {
      const { queues } = await import('./priority-queues');
      const queue = (queues as any)[queueName];
      if (!queue) throw new Error(`Queue ${queueName} not found`);

      await queue.add(event.event_type, {
        ...event.payload,
        tenantId: event.tenant_id,
        outboxId: event.id,
      }, {
        priority,
        jobId: `outbox_${event.id}`, // idempotência: mesmo outboxId = mesmo jobId
      });

      // Marcar como processado
      await supabase
        .from('outbox')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', event.id);

      infraLogger.info({
        outboxId: event.id,
        eventType: event.event_type,
        queue: queueName,
        priority,
      }, 'Outbox event processed');

    } catch (err) {
      infraLogger.error({ err, outboxId: event.id }, 'Outbox event failed');

      // Incrementar retry_count
      await supabase
        .from('outbox')
        .update({ retry_count: event.retry_count + 1 })
        .eq('id', event.id);
    }
  }
}

export const outboxService = new OutboxService();
