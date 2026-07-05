import { AgentState } from '../agent.state';
import { ISearchPort } from '../../ports/search.port';
import { IDatabasePort } from '../../ports/database.port';
import { ILoggerPort } from '../../ports/logger.port';

function formatCustomer(customer: NonNullable<Awaited<ReturnType<IDatabasePort['fetchCustomer']>>>): string {
  const overdueInvoices = customer.invoices.filter(i => i.status === 'overdue');
  const openTickets = customer.tickets.filter(t => t.status === 'open');

  return `Cliente: ${customer.name}
Plano: ${customer.plan} (R$${(customer.monthly_value_cents / 100).toFixed(2)}/mês)
Status: ${customer.status}
Faturas em atraso: ${overdueInvoices.length} (total: R$${overdueInvoices.reduce((s, i) => s + i.amount_cents, 0) / 100})
Tickets abertos: ${openTickets.length}`;
}

export function makeNodeFetchContext(deps: { search: ISearchPort; db: IDatabasePort; logger: ILoggerPort }) {
  return async function nodeFetchContext(state: AgentState): Promise<Partial<AgentState>> {
    const { dataSource, userMessage, tenantId, customerId } = state;

    let ragContext = '';
    let dbContext = '';

    const promises: Promise<void>[] = [];

    if (dataSource === 'qdrant' || dataSource === 'both') {
      promises.push(
        deps.search.search(userMessage, tenantId, { limit: 4, hydeSensitivity: 'auto' })
          .then(results => {
            ragContext = results.map((r, i) =>
              `[Doc ${i + 1}] ${r.filename} (score: ${r.score.toFixed(2)}):\n${r.content}`
            ).join('\n\n');
          })
          .catch(() => { ragContext = ''; })
      );
    }

    if (dataSource === 'supabase' || dataSource === 'both') {
      promises.push(
        deps.db.fetchCustomer(customerId, tenantId)
          .then(customer => { dbContext = customer ? formatCustomer(customer) : ''; })
          .catch(() => { dbContext = ''; })
      );
    }

    await Promise.allSettled(promises);

    deps.logger.info({
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
  };
}
