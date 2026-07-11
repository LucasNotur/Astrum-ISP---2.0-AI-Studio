/**
 * ETL S70 — Conversacional: tickets legados → conversations + messages.
 * Re-ingestão de knowledge_articles no pipeline RAG (Qdrant).
 *
 * Plano Mestre V2, S70. Usa splitTicket() (lib/ticket-splitter.ts) para
 * converter cada ticket com subcoleção `messages` em 1 conversation + N messages.
 * Idempotente: re-executar não duplica (via legacy_ticket_conversation_map e
 * unique index em messages.legacy_id). Delta-aware: só processa mensagens novas
 * (createdAt > last_synced_message_at) em execuções incrementais.
 */

import crypto from 'node:crypto';
import { splitTicket, type LegacyTicketMessage } from './lib/ticket-splitter';
import { type EtlDeps, type EtlEntityResult, type EtlOptions } from './firestore-to-supabase';

// ─── Tipos adicionais ─────────────────────────────────────────────────────────

export interface ConversationMapEntry {
  conversationId: string | null;
  lastSyncedAt: string | null;
}

export interface IndexingJobInput {
  tenantId: string;
  documentId: string;
  filename: string;
  fileType: string;
  textContent: string;
}

export interface LegacyKnowledgeArticle {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
  category?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Extensão dos deps S69 com operações específicas de conversas e RAG. */
export interface EtlDepsS70 extends EtlDeps {
  fetchTicketMessages: (tenantId: string, ticketId: string) => Promise<LegacyTicketMessage[]>;
  resolveConversationByLegacyTicket: (tenantId: string, legacyTicketId: string) => Promise<ConversationMapEntry>;
  upsertConversationMap: (
    tenantId: string,
    legacyTicketId: string,
    conversationId: string,
    lastMessageAt: string | null,
  ) => Promise<void>;
  enqueueIndexing: (job: IndexingJobInput) => Promise<void>;
}

// ─── Migração de tickets → conversations ─────────────────────────────────────

/**
 * Migra todos os tickets de um tenant como conversations + messages.
 * Idempotente: tickets já mapeados passam pelo delta-sync (só mensagens novas).
 */
export async function migrateTicketConversations(
  deps: EtlDepsS70,
  opts: EtlOptions,
): Promise<EtlEntityResult> {
  const tickets = (await deps.fetchCollection(opts.tenantId, 'tickets')) as Array<{
    id: string;
    customerId?: string;
    subject?: string;
    createdAt?: string;
  }>;

  let inserted = 0;
  let updated = 0;

  for (const ticket of tickets) {
    const [messages, existing, customerUuid] = await Promise.all([
      deps.fetchTicketMessages(opts.tenantId, ticket.id),
      deps.resolveConversationByLegacyTicket(opts.tenantId, ticket.id),
      ticket.customerId
        ? deps.resolveCustomerUuid(opts.tenantId, ticket.customerId)
        : Promise.resolve(null),
    ]);

    const { conversation, messages: msgRows, lastMessageAt } = splitTicket(
      opts.tenantId,
      { ...ticket, messages },
      customerUuid,
      existing.lastSyncedAt ?? undefined,
    );

    if (!opts.dryRun) {
      let convId = existing.conversationId;

      if (!convId) {
        // Novo: gera UUID no cliente para poder usar em messages imediatamente
        convId = crypto.randomUUID();
        // Strip legacy_ticket_id — pertence ao mapa, não à tabela conversations
        const { legacy_ticket_id: _drop, ...convRow } = conversation as Record<string, unknown>;
        await deps.insertRows('conversations', [{ id: convId, ...convRow }]);
        inserted++;
      } else {
        updated++;
      }

      if (msgRows.length) {
        const msgsWithConv = msgRows.map((m) => ({ ...m, conversation_id: convId }));
        await deps.insertRows('messages', msgsWithConv);
      }

      await deps.upsertConversationMap(opts.tenantId, ticket.id, convId, lastMessageAt);
    } else {
      // dry-run: conta o que faria
      if (!existing.conversationId) inserted++;
      else updated++;
    }
  }

  deps.log(
    `ticket_conversations: ${inserted} novas, ${updated} delta-atualizadas` +
    (opts.dryRun ? ' (dry-run)' : ''),
  );
  return { entity: 'ticket_conversations', sourceCount: tickets.length, inserted, updated };
}

// ─── Re-ingestão de knowledge_articles ───────────────────────────────────────

/**
 * Copia artigos da knowledge_base Firestore para knowledge_articles Supabase
 * e enfileira re-ingestão RAG para cada artigo novo.
 * NÃO copia artigos já existentes (legacy_id único).
 */
export async function migrateKnowledgeArticles(
  deps: EtlDepsS70,
  opts: EtlOptions,
): Promise<EtlEntityResult> {
  const articles = (await deps.fetchCollection(
    opts.tenantId,
    'knowledge_articles',
  )) as LegacyKnowledgeArticle[];

  const existing = await deps.fetchExistingLegacyIds(opts.tenantId, 'knowledge_articles');
  const toInsert = articles.filter((a) => !existing.has(a.id));

  if (!opts.dryRun) {
    for (const a of toInsert) {
      const docId = crypto.randomUUID();
      await deps.insertRows('knowledge_articles', [
        {
          id: docId,
          tenant_id: opts.tenantId,
          legacy_id: a.id,
          title: a.title ?? '(sem título)',
          content: a.content ?? '',
          tags: a.tags ?? [],
          category: a.category ?? null,
          ingest_status: 'pending',
          created_at: a.createdAt ?? new Date().toISOString(),
          updated_at: a.updatedAt ?? new Date().toISOString(),
        },
      ]);

      await deps.enqueueIndexing({
        tenantId: opts.tenantId,
        documentId: docId,
        filename: a.title ?? a.id,
        fileType: 'text',
        textContent: a.content ?? '',
      });
    }
  }

  deps.log(
    `knowledge_articles: ${toInsert.length} novas, ${articles.length - toInsert.length} já indexadas` +
    (opts.dryRun ? ' (dry-run)' : ''),
  );
  return {
    entity: 'knowledge_articles',
    sourceCount: articles.length,
    inserted: toInsert.length,
    updated: 0,
  };
}

// ─── Pipeline S70 ─────────────────────────────────────────────────────────────

export async function runS70Backfill(deps: EtlDepsS70, opts: EtlOptions): Promise<EtlEntityResult[]> {
  deps.log(`=== S70 backfill tenant ${opts.tenantId}${opts.dryRun ? ' [DRY-RUN]' : ''} ===`);
  return [
    await migrateTicketConversations(deps, opts),
    await migrateKnowledgeArticles(deps, opts),
  ];
}
