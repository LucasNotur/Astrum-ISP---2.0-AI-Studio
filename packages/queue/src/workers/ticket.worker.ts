import { Worker, type Job } from 'bullmq';
import { connection } from '../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../apps/api/src/infrastructure/queue/bullmq.client';
import { supabaseAdmin } from '../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../apps/api/src/infrastructure/logging/logger';
import { addSentryToWorker } from '../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import { svixEvents } from '../../../apps/api/src/adapters/webhooks/svix.service';

export interface TicketJobData {
  tenantId: string;
  ticketId?: string;
  customerId: string;
  title: string;
  priority: string;
  category: string;
  description?: string;
}

async function processTicket(job: Job<TicketJobData>): Promise<void> {
  const { tenantId, customerId, title, priority, category, description } = job.data;
  let { ticketId } = job.data;

  infraLogger.info({ tenantId, customerId, action: 'process_ticket' }, 'Processando ticket');

  if (!ticketId) {
    const { data: ticket, error } = await supabaseAdmin.from('tickets').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      title,
      description,
      priority,
      category,
      status: 'open',
    }).select('id').single();

    if (error) {
      infraLogger.error({ err: error }, 'Erro ao criar ticket no worker');
      throw error;
    }
    
    ticketId = ticket.id;
  }

  // Em ticket.worker.ts, após criar ticket:
  await svixEvents.ticketCreated(tenantId, {
    ticketId, customerId, title, priority, category,
  });

  infraLogger.info({ ticketId }, 'Ticket processado e evento Svix enviado');
}

export function createTicketWorker() {
  const worker = new Worker<TicketJobData>('astrum:tickets', processTicket, {
    connection: connection as any,
    concurrency: 5,
  });

  setupDLQ(worker);
  addSentryToWorker(worker, 'ticket-worker');
  return worker;
}
