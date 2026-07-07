import { AgentState } from '../agent.state';
import { ISearchPort } from '../../ports/search.port';
import { IDatabasePort } from '../../ports/database.port';
import { ILoggerPort } from '../../ports/logger.port';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { isLiveTranslationEnabled } from '../../../infrastructure/ai/language-detector';

function formatCustomer(customer: NonNullable<Awaited<ReturnType<IDatabasePort['fetchCustomer']>>>): string {
  const overdueInvoices = customer.invoices.filter(i => i.status === 'overdue');
  const openTickets = customer.tickets.filter(t => t.status === 'open');

  return `Cliente: ${customer.name}
Plano: ${customer.plan} (R$${(customer.monthly_value_cents / 100).toFixed(2)}/mês)
Status: ${customer.status}
Faturas em atraso: ${overdueInvoices.length} (total: R$${overdueInvoices.reduce((s, i) => s + i.amount_cents, 0) / 100})
Tickets abertos: ${openTickets.length}`;
}

/**
 * IA-14 — Traduz a query do usuário para pt-BR antes do retrieval no Qdrant.
 * Fail-open (RN4): erro → query original. Helicone UseCase 'rag-query-translate'.
 */
async function translateQueryToPt(query: string, tenantId: string): Promise<string> {
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini') as any,
      schema: z.object({ translated: z.string() }),
      system: 'Traduza a mensagem do cliente para português do Brasil (pt-BR) para ser usada como busca em uma base de conhecimento técnica de ISP. Mantenha termos técnicos e nomes próprios. Responda apenas com o JSON {"translated": "..."}.',
      messages: [{ role: 'user', content: query }],
      headers: {
        'Helicone-Property-TenantId': tenantId,
        'Helicone-Property-UseCase': 'rag-query-translate',
      },
    });
    return object.translated || query;
  } catch {
    return query;
  }
}

export function makeNodeFetchContext(deps: { search: ISearchPort; db: IDatabasePort; logger: ILoggerPort }) {
  return async function nodeFetchContext(state: AgentState): Promise<Partial<AgentState>> {
    const { dataSource, tenantId, customerId } = state;
    const originalQuery = state.rewrittenQuery ?? state.userMessage;

    // IA-14: se flag on + idioma != pt e vai buscar no Qdrant, traduz a query.
    let searchQuery = originalQuery;
    if (
      isLiveTranslationEnabled()
      && state.detectedLanguage
      && state.detectedLanguage !== 'pt'
      && (dataSource === 'qdrant' || dataSource === 'both')
    ) {
      const translated = await translateQueryToPt(originalQuery, tenantId);
      if (translated !== originalQuery) {
        deps.logger.info({
          step: 'fetch_context',
          from: state.detectedLanguage,
          originalChars: originalQuery.length,
          translatedChars: translated.length,
        }, 'Agent: query traduzida para RAG');
      }
      searchQuery = translated;
    }

    let ragContext = '';
    let dbContext = '';

    const promises: Promise<void>[] = [];

    if (dataSource === 'qdrant' || dataSource === 'both') {
      promises.push(
        deps.search.search(searchQuery, tenantId, { limit: 4, hydeSensitivity: 'auto' })
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
