import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
}));

vi.mock('../../infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('../../adapters/openai/openai.adapter', () => ({
  callOpenAI: vi.fn(),
}));

vi.mock('../../../../../packages/queue/src/workers/indexing.worker', () => ({
  aiProcessingQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-job' }) },
}));

import supabase from '../../infrastructure/database/supabase.client';
import { callOpenAI } from '../../adapters/openai/openai.adapter';
import {
  findCandidateConversations,
  generateDraft,
  listDrafts,
  approveAndPublish,
  rejectDraft,
} from './kb-draft.service';

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockChain(overrides: Record<string, unknown> = {}) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  return chain;
}

// ── findCandidateConversations ───────────────────────────────────────────────

describe('findCandidateConversations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no resolved conversations', async () => {
    const chain = mockChain({ eq: vi.fn().mockReturnThis(), lt: vi.fn().mockResolvedValue({ data: [], error: null }) });
    vi.mocked(supabase.from).mockReturnValue(chain as any);

    const result = await findCandidateConversations('tenant-1');
    expect(result).toEqual([]);
  });

  it('filters out conversations that already have drafts', async () => {
    const convs = [{ id: 'conv-1', updated_at: '2026-07-01T00:00:00Z' }];
    let callCount = 0;

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'conversations') {
        return mockChain({ lt: vi.fn().mockResolvedValue({ data: convs, error: null }) }) as any;
      }
      if (table === 'kb_drafts' && callCount++ === 0) {
        return mockChain({ in: vi.fn().mockResolvedValue({ data: [{ conversation_id: 'conv-1' }], error: null }) }) as any;
      }
      return mockChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any;
    });

    const result = await findCandidateConversations('tenant-1');
    expect(result).toEqual([]);
  });

  it('excludes conversations with fewer than 3 messages', async () => {
    const convs = [{ id: 'conv-2', updated_at: '2026-07-01T00:00:00Z' }];
    let callCount = 0;

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'conversations') {
        return mockChain({ lt: vi.fn().mockResolvedValue({ data: convs, error: null }) }) as any;
      }
      if (table === 'kb_drafts') {
        return mockChain({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any;
      }
      // messages
      if (callCount++ === 0) {
        return mockChain({ order: vi.fn().mockResolvedValue({ data: [{ content: 'oi', role: 'user', created_at: '' }, { content: 'olá', role: 'assistant', created_at: '' }], error: null }) }) as any;
      }
      return mockChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any;
    });

    const result = await findCandidateConversations('tenant-1');
    expect(result).toEqual([]);
  });
});

// ── generateDraft ────────────────────────────────────────────────────────────

describe('generateDraft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates draft from conversation messages and saves it', async () => {
    const msgs = [
      { role: 'user', content: 'minha internet não funciona', created_at: '' },
      { role: 'assistant', content: 'verifique o cabo de rede', created_at: '' },
      { role: 'user', content: 'funcionou, obrigado', created_at: '' },
    ];

    const savedDraft = {
      id: 'draft-1', tenant_id: 'tenant-1', conversation_id: 'conv-1',
      ticket_id: null, status: 'pending', draft_title: 'Como resolver falta de internet',
      draft_body: 'Verificar cabo...', source_summary: 'Cliente sem internet, resolvido com cabo',
      generated_by: 'auto', reviewed_by: null, reviewed_at: null,
      published_article_id: null, created_at: '2026-07-12T00:00:00Z',
    };

    vi.mocked(callOpenAI).mockResolvedValue({
      content: JSON.stringify({ title: 'Como resolver falta de internet', body: 'Verificar cabo...', summary: 'Resolvido com cabo' }),
      model: 'gpt-4o', usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
    });

    let call = 0;
    vi.mocked(supabase.from).mockImplementation(() => {
      if (call++ === 0) {
        return mockChain({ order: vi.fn().mockResolvedValue({ data: msgs, error: null }) }) as any;
      }
      return mockChain({ single: vi.fn().mockResolvedValue({ data: savedDraft, error: null }) }) as any;
    });

    const result = await generateDraft('tenant-1', 'conv-1');
    expect(result.draftTitle).toBe('Como resolver falta de internet');
    expect(result.status).toBe('pending');
    expect(callOpenAI).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o', tenantId: 'tenant-1' }));
  });

  it('handles invalid JSON from LLM with graceful fallback', async () => {
    const msgs = [
      { role: 'user', content: 'problema', created_at: '' },
      { role: 'assistant', content: 'solução', created_at: '' },
      { role: 'user', content: 'ok', created_at: '' },
    ];
    const savedDraft = {
      id: 'draft-2', tenant_id: 'tenant-1', conversation_id: 'conv-1',
      ticket_id: null, status: 'pending', draft_title: 'Artigo gerado automaticamente',
      draft_body: 'raw text from LLM', source_summary: 'Rascunho gerado a partir de conversa resolvida.',
      generated_by: 'auto', reviewed_by: null, reviewed_at: null,
      published_article_id: null, created_at: '2026-07-12T00:00:00Z',
    };

    vi.mocked(callOpenAI).mockResolvedValue({
      content: 'raw text from LLM', model: 'gpt-4o',
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    });

    let call = 0;
    vi.mocked(supabase.from).mockImplementation(() => {
      if (call++ === 0) return mockChain({ order: vi.fn().mockResolvedValue({ data: msgs, error: null }) }) as any;
      return mockChain({ single: vi.fn().mockResolvedValue({ data: savedDraft, error: null }) }) as any;
    });

    const result = await generateDraft('tenant-1', 'conv-1');
    expect(result.draftTitle).toBe('Artigo gerado automaticamente');
  });

  it('throws when conversation has no messages', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      mockChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any,
    );

    await expect(generateDraft('tenant-1', 'conv-empty')).rejects.toThrow('Conversa sem mensagens');
  });
});

// ── listDrafts ───────────────────────────────────────────────────────────────

describe('listDrafts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no drafts exist', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      mockChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any,
    );
    const result = await listDrafts('tenant-1');
    expect(result).toEqual([]);
  });

  it('maps DB rows to KbDraft objects', async () => {
    const rows = [{
      id: 'draft-1', tenant_id: 'tenant-1', conversation_id: 'conv-1',
      ticket_id: null, status: 'pending', draft_title: 'Título',
      draft_body: 'Corpo', source_summary: 'Resumo', generated_by: 'auto',
      reviewed_by: null, reviewed_at: null, published_article_id: null,
      created_at: '2026-07-12T00:00:00Z',
    }];

    vi.mocked(supabase.from).mockReturnValue(
      mockChain({ order: vi.fn().mockResolvedValue({ data: rows, error: null }) }) as any,
    );

    const result = await listDrafts('tenant-1');
    expect(result).toHaveLength(1);
    expect(result[0].draftTitle).toBe('Título');
    expect(result[0].conversationId).toBe('conv-1');
  });
});

// ── approveAndPublish ────────────────────────────────────────────────────────

describe('approveAndPublish', () => {
  beforeEach(() => vi.clearAllMocks());

  it('publishes draft as knowledge_article and marks as published', async () => {
    const draft = {
      id: 'draft-1', tenant_id: 'tenant-1', status: 'pending',
      draft_title: 'Artigo', draft_body: 'Corpo do artigo',
    };
    const article = { id: 'article-1' };

    let call = 0;
    vi.mocked(supabase.from).mockImplementation(() => {
      call++;
      if (call === 1) return mockChain({ single: vi.fn().mockResolvedValue({ data: draft, error: null }) }) as any;
      if (call === 2) return mockChain({ single: vi.fn().mockResolvedValue({ data: article, error: null }) }) as any;
      return mockChain({ update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) }) as any;
    });

    const result = await approveAndPublish('tenant-1', 'draft-1', 'user-1');
    expect(result.articleId).toBe('article-1');
  });

  it('throws when draft status is not pending', async () => {
    const draft = { id: 'draft-1', tenant_id: 'tenant-1', status: 'rejected' };
    vi.mocked(supabase.from).mockReturnValue(
      mockChain({ single: vi.fn().mockResolvedValue({ data: draft, error: null }) }) as any,
    );

    await expect(approveAndPublish('tenant-1', 'draft-1', 'user-1'))
      .rejects.toThrow('status=rejected não pode ser aprovado');
  });
});

// ── rejectDraft ──────────────────────────────────────────────────────────────

describe('rejectDraft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks draft as rejected', async () => {
    const chain: any = { update: vi.fn().mockReturnThis(), eq: vi.fn() };
    let eqCalls = 0;
    chain.eq.mockImplementation(() => {
      eqCalls++;
      return eqCalls >= 2 ? Promise.resolve({ error: null }) : chain;
    });
    vi.mocked(supabase.from).mockReturnValue(chain as any);

    await expect(rejectDraft('tenant-1', 'draft-1', 'user-1')).resolves.toBeUndefined();
  });
});
