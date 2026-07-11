import { describe, it, expect, vi } from 'vitest';
import {
  migrateTicketConversations,
  migrateKnowledgeArticles,
  runS70Backfill,
  type EtlDepsS70,
} from './etl-s70-conversations';

function makeDeps(overrides: Partial<EtlDepsS70> = {}): EtlDepsS70 {
  return {
    fetchCollection: vi.fn().mockResolvedValue([]),
    fetchExistingLegacyIds: vi.fn().mockResolvedValue(new Set()),
    insertRows: vi.fn().mockResolvedValue(undefined),
    updateRowByLegacyId: vi.fn().mockResolvedValue(undefined),
    resolveCustomerUuid: vi.fn().mockResolvedValue(null),
    log: vi.fn(),
    fetchTicketMessages: vi.fn().mockResolvedValue([]),
    resolveConversationByLegacyTicket: vi.fn().mockResolvedValue({ conversationId: null, lastSyncedAt: null }),
    upsertConversationMap: vi.fn().mockResolvedValue(undefined),
    enqueueIndexing: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const T = 't1';
const MSG = { id: 'm1', senderType: 'customer', text: 'Olá', createdAt: '2024-01-01T10:00:00Z' };
const TICKET = { id: 'tk1', customerId: 'c1', subject: 'Internet lenta', createdAt: '2024-01-01T09:00:00Z' };
const ART = { id: 'art1', title: 'Guia Roteador', content: 'Configure assim...', category: 'hardware', createdAt: '2024-01-01T00:00:00Z' };

// ─── migrateTicketConversations ───────────────────────────────────────────────

describe('migrateTicketConversations — ticket novo', () => {
  it('cria 1 conversation e insere mensagens com conversation_id', async () => {
    const deps = makeDeps({
      fetchCollection: vi.fn().mockResolvedValue([TICKET]),
      fetchTicketMessages: vi.fn().mockResolvedValue([MSG]),
      resolveCustomerUuid: vi.fn().mockResolvedValue('cust-uuid'),
    });

    const res = await migrateTicketConversations(deps, { tenantId: T, dryRun: false });

    expect(res.inserted).toBe(1);
    expect(res.updated).toBe(0);
    expect(res.sourceCount).toBe(1);

    // conversation inserida sem legacy_ticket_id (vai para o mapa)
    const convCall = (deps.insertRows as ReturnType<typeof vi.fn>).mock.calls
      .find(([table]: [string]) => table === 'conversations');
    expect(convCall).toBeTruthy();
    expect(convCall[1][0]).toMatchObject({ tenant_id: T, customer_id: 'cust-uuid', channel: 'whatsapp' });
    expect(convCall[1][0]).not.toHaveProperty('legacy_ticket_id');
    expect(convCall[1][0].id).toMatch(/^[0-9a-f-]{36}$/); // UUID gerado

    // mensagem inserida com o mesmo UUID de conversation
    const msgCall = (deps.insertRows as ReturnType<typeof vi.fn>).mock.calls
      .find(([table]: [string]) => table === 'messages');
    expect(msgCall).toBeTruthy();
    expect(msgCall[1][0]).toMatchObject({ role: 'user', content: 'Olá', legacy_id: 'm1' });
    expect(msgCall[1][0].conversation_id).toBe(convCall[1][0].id);

    expect(deps.upsertConversationMap).toHaveBeenCalledOnce();
  });
});

describe('migrateTicketConversations — delta (ticket já mapeado)', () => {
  it('não duplica conversation; insere apenas mensagens novas', async () => {
    const deps = makeDeps({
      fetchCollection: vi.fn().mockResolvedValue([TICKET]),
      fetchTicketMessages: vi.fn().mockResolvedValue([
        MSG, // já sincronizado
        { id: 'm2', senderType: 'ai', text: 'Vou verificar', createdAt: '2024-01-01T10:01:00Z' },
      ]),
      resolveConversationByLegacyTicket: vi.fn().mockResolvedValue({
        conversationId: 'existing-conv-uuid',
        lastSyncedAt: '2024-01-01T10:00:00Z',
      }),
    });

    const res = await migrateTicketConversations(deps, { tenantId: T, dryRun: false });

    expect(res.inserted).toBe(0);
    expect(res.updated).toBe(1);

    // conversation NÃO inserida novamente
    const convCall = (deps.insertRows as ReturnType<typeof vi.fn>).mock.calls
      .find(([table]: [string]) => table === 'conversations');
    expect(convCall).toBeUndefined();

    // só m2 inserida (m1 filtrada pelo since)
    const msgCall = (deps.insertRows as ReturnType<typeof vi.fn>).mock.calls
      .find(([table]: [string]) => table === 'messages');
    expect(msgCall).toBeTruthy();
    expect(msgCall[1]).toHaveLength(1);
    expect(msgCall[1][0].legacy_id).toBe('m2');
    expect(msgCall[1][0].conversation_id).toBe('existing-conv-uuid');
  });
});

describe('migrateTicketConversations — dry-run', () => {
  it('não escreve nada, apenas conta', async () => {
    const deps = makeDeps({
      fetchCollection: vi.fn().mockResolvedValue([TICKET]),
      fetchTicketMessages: vi.fn().mockResolvedValue([MSG]),
    });

    const res = await migrateTicketConversations(deps, { tenantId: T, dryRun: true });

    expect(res.inserted).toBe(1);
    expect(deps.insertRows).not.toHaveBeenCalled();
    expect(deps.upsertConversationMap).not.toHaveBeenCalled();
  });
});

describe('migrateTicketConversations — ticket sem mensagens', () => {
  it('cria conversation vazia sem tentar inserir messages', async () => {
    const deps = makeDeps({
      fetchCollection: vi.fn().mockResolvedValue([{ id: 'tk_empty', createdAt: '2024-01-01T09:00:00Z' }]),
      fetchTicketMessages: vi.fn().mockResolvedValue([]),
    });

    const res = await migrateTicketConversations(deps, { tenantId: T, dryRun: false });

    expect(res.inserted).toBe(1);
    const msgCall = (deps.insertRows as ReturnType<typeof vi.fn>).mock.calls
      .find(([table]: [string]) => table === 'messages');
    expect(msgCall).toBeUndefined();
    expect(deps.upsertConversationMap).toHaveBeenCalledWith(T, 'tk_empty', expect.any(String), null);
  });
});

// ─── migrateKnowledgeArticles ─────────────────────────────────────────────────

describe('migrateKnowledgeArticles — artigo novo', () => {
  it('insere artigo e enfileira indexação RAG', async () => {
    const deps = makeDeps({
      fetchCollection: vi.fn().mockResolvedValue([ART]),
    });

    const res = await migrateKnowledgeArticles(deps, { tenantId: T, dryRun: false });

    expect(res.inserted).toBe(1);
    expect(res.updated).toBe(0);

    expect(deps.insertRows).toHaveBeenCalledOnce();
    const row = (deps.insertRows as ReturnType<typeof vi.fn>).mock.calls[0][1][0];
    expect(row).toMatchObject({ legacy_id: 'art1', title: 'Guia Roteador', ingest_status: 'pending' });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);

    expect(deps.enqueueIndexing).toHaveBeenCalledOnce();
    const job = (deps.enqueueIndexing as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(job).toMatchObject({ tenantId: T, textContent: ART.content, documentId: row.id });
  });
});

describe('migrateKnowledgeArticles — artigo já indexado', () => {
  it('não duplica artigo existente por legacy_id', async () => {
    const deps = makeDeps({
      fetchCollection: vi.fn().mockResolvedValue([ART]),
      fetchExistingLegacyIds: vi.fn().mockResolvedValue(new Set(['art1'])),
    });

    const res = await migrateKnowledgeArticles(deps, { tenantId: T, dryRun: false });

    expect(res.inserted).toBe(0);
    expect(deps.insertRows).not.toHaveBeenCalled();
    expect(deps.enqueueIndexing).not.toHaveBeenCalled();
  });
});

describe('migrateKnowledgeArticles — dry-run', () => {
  it('não insere nem enfileira', async () => {
    const deps = makeDeps({ fetchCollection: vi.fn().mockResolvedValue([ART]) });
    await migrateKnowledgeArticles(deps, { tenantId: T, dryRun: true });
    expect(deps.insertRows).not.toHaveBeenCalled();
    expect(deps.enqueueIndexing).not.toHaveBeenCalled();
  });
});

// ─── runS70Backfill ───────────────────────────────────────────────────────────

describe('runS70Backfill', () => {
  it('retorna relatório com ticket_conversations e knowledge_articles', async () => {
    const deps = makeDeps();
    const results = await runS70Backfill(deps, { tenantId: T, dryRun: true });
    expect(results.map((r) => r.entity)).toEqual(['ticket_conversations', 'knowledge_articles']);
  });
});
