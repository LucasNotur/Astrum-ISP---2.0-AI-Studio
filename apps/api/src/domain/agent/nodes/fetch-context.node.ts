import { AgentState } from '../agent.state';
import { HybridSearchService } from '../../../infrastructure/rag/hybrid-search.service';
import { getQdrantClient } from '../../../adapters/vector/qdrant.adapter';
import { supabase } from '../../../infrastructure/database/supabase.client';
import { infraLogger } from '../../../infrastructure/logging/logger';

async function fetchCustomerData(customerId: string, tenantId: string): Promise<string> {
  const { data: customer } = await supabase
    .from('customers')
    .select(`
      name, plan, status, monthly_value_cents,
      invoices(id, amount_cents, status, due_date),
      tickets(id, title, status, created_at)
    `)
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .single();

  if (!customer) return '';

  const overdueInvoices = (customer.invoices as any[])?.filter(i => i.status === 'overdue') ?? [];
  const openTickets = (customer.tickets as any[])?.filter(t => t.status === 'open') ?? [];

  return `Cliente: ${customer.name}
Plano: ${customer.plan} (R$${(customer.monthly_value_cents / 100).toFixed(2)}/mês)
Status: ${customer.status}
Faturas em atraso: ${overdueInvoices.length} (total: R$${overdueInvoices.reduce((s: number, i: any) => s + i.amount_cents, 0) / 100})
Tickets abertos: ${openTickets.length}`;
}

export async function nodeFetchContext(state: AgentState): Promise<Partial<AgentState>> {
  const { dataSource, userMessage, tenantId, customerId } = state;

  let ragContext = '';
  let dbContext = '';

  const promises: Promise<void>[] = [];

  if (dataSource === 'qdrant' || dataSource === 'both') {
    promises.push(
      new HybridSearchService(getQdrantClient()).search(userMessage, tenantId, { limit: 4, hydeSensitivity: 'auto' })
        .then((results: any) => {
          ragContext = results.map((r: any, i: number) =>
            `[Doc ${i + 1}] ${r.filename} (score: ${r.score.toFixed(2)}):\n${r.content}`
          ).join('\n\n');
        })
        .catch(() => { ragContext = ''; })
    );
  }

  if (dataSource === 'supabase' || dataSource === 'both') {
    promises.push(
      fetchCustomerData(customerId, tenantId)
        .then(data => { dbContext = data; })
        .catch(() => { dbContext = ''; })
    );
  }

  await Promise.allSettled(promises);

  infraLogger.info({
    step: 'fetch_context',
    hasRAG: Boolean(ragContext),
    hasDB: Boolean(dbContext),
    ragChars: ragContext.length,
  }, 'Agent: fetch_context');

  return {
    ragContext,
    dbContext,
    steps: [...state.steps, 'fetch_context'],
  };
}
