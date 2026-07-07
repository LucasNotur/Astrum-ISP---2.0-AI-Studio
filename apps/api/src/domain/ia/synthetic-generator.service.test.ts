import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tenantsMaybeSingle = vi.fn();
  const tenantsEq = vi.fn(() => ({ maybeSingle: tenantsMaybeSingle }));
  const tenantsSelect = vi.fn(() => ({ eq: tenantsEq }));

  const conversationsInsertSelect = vi.fn();
  const conversationsInsert = vi.fn(() => ({ select: conversationsInsertSelect }));
  const messagesInsert = vi.fn();
  const ticketsInsert = vi.fn();

  const from = vi.fn((table: string) => {
    if (table === 'tenants') return { select: tenantsSelect };
    if (table === 'conversations') return { insert: conversationsInsert };
    if (table === 'messages') return { insert: messagesInsert };
    if (table === 'tickets') return { insert: ticketsInsert };
    return { select: vi.fn(), insert: vi.fn() };
  });

  return {
    tenantsMaybeSingle,
    tenantsEq,
    tenantsSelect,
    conversationsInsertSelect,
    conversationsInsert,
    messagesInsert,
    ticketsInsert,
    from,
  };
});

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mocks.from(...args) },
}));

vi.mock('../../infrastructure/cache/redis.client', () => ({
  getRedisClient: () => ({
    setex: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('../../infrastructure/config/openai-key', () => ({
  resolveOpenAIKey: () => 'test-key',
}));

vi.mock('../../infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  SyntheticGeneratorService,
  SyntheticAccessError,
  SyntheticInputError,
  buildBatchRequests,
  parseBatchResponseLine,
  assertTenantSandbox,
} from './synthetic-generator.service';

describe('synthetic-generator.service (IA-45)', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('assertTenantSandbox', () => {
    it('lança SyntheticAccessError quando tenant é real (is_sandbox=false)', async () => {
      mocks.tenantsMaybeSingle.mockResolvedValueOnce({
        data: { is_sandbox: false },
        error: null,
      });
      await expect(assertTenantSandbox('tenant-real')).rejects.toBeInstanceOf(
        SyntheticAccessError,
      );
    });

    it('lança SyntheticAccessError quando tenant não existe', async () => {
      mocks.tenantsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
      await expect(assertTenantSandbox('ghost')).rejects.toBeInstanceOf(
        SyntheticAccessError,
      );
    });

    it('lança SyntheticAccessError quando tenantId vazio', async () => {
      await expect(assertTenantSandbox('')).rejects.toBeInstanceOf(
        SyntheticAccessError,
      );
      expect(mocks.from).not.toHaveBeenCalled();
    });

    it('passa quando is_sandbox=true', async () => {
      mocks.tenantsMaybeSingle.mockResolvedValueOnce({
        data: { is_sandbox: true },
        error: null,
      });
      await expect(assertTenantSandbox('tenant-teste')).resolves.toBeUndefined();
    });
  });

  describe('start() — guarda dupla', () => {
    const svc = new SyntheticGeneratorService();
    const validParams = {
      conversations: 5,
      intentMix: { '2via_boleto': 60, 'suporte_tecnico': 40 },
      mediaPct: 5,
    };

    it('lança SyntheticAccessError quando tenant é real', async () => {
      mocks.tenantsMaybeSingle.mockResolvedValueOnce({
        data: { is_sandbox: false },
        error: null,
      });
      await expect(
        svc.start('tenant-real', 'u1', validParams),
      ).rejects.toBeInstanceOf(SyntheticAccessError);
    });

    it('lança SyntheticInputError com mensagem clara quando intentMix soma ≠ 100', async () => {
      await expect(
        svc.start('tenant-x', 'u1', {
          conversations: 5,
          intentMix: { a: 30, b: 30 }, // soma 60
          mediaPct: 5,
        }),
      ).rejects.toBeInstanceOf(SyntheticInputError);
      try {
        await svc.start('tenant-x', 'u1', {
          conversations: 5,
          intentMix: { a: 30, b: 30 },
          mediaPct: 5,
        });
      } catch (e) {
        expect((e as Error).message).toMatch(/deve ser 100/);
        expect((e as Error).message).toMatch(/60/);
      }
    });

    it('lança SyntheticInputError quando conversations está fora de 1..2000', async () => {
      await expect(
        svc.start('tenant-x', 'u1', { ...validParams, conversations: 0 }),
      ).rejects.toBeInstanceOf(SyntheticInputError);
      await expect(
        svc.start('tenant-x', 'u1', { ...validParams, conversations: 5000 }),
      ).rejects.toBeInstanceOf(SyntheticInputError);
    });

    it('lança SyntheticInputError quando mediaPct > 30', async () => {
      await expect(
        svc.start('tenant-x', 'u1', { ...validParams, mediaPct: 50 }),
      ).rejects.toBeInstanceOf(SyntheticInputError);
    });
  });

  describe('parseBatchResponseLine — fail-open', () => {
    it('descarta linha com JSON inválido sem lançar', () => {
      expect(parseBatchResponseLine('{not json')).toBeNull();
    });

    it('descarta linha com status_code != 200', () => {
      const line = JSON.stringify({
        response: { status_code: 500, body: {} },
      });
      expect(parseBatchResponseLine(line)).toBeNull();
    });

    it('descarta linha sem content', () => {
      const line = JSON.stringify({
        response: { status_code: 200, body: { choices: [] } },
      });
      expect(parseBatchResponseLine(line)).toBeNull();
    });

    it('descarta linha com content que não bate no schema zod', () => {
      const line = JSON.stringify({
        response: {
          status_code: 200,
          body: {
            choices: [{ message: { content: JSON.stringify({ turns: [] }) } }],
          },
        },
      });
      expect(parseBatchResponseLine(line)).toBeNull();
    });

    it('retorna objeto válido quando content bate no schema', () => {
      const valid = {
        persona_name: 'Fictício da Silva',
        intent: 'suporte_tecnico',
        channel: 'whatsapp',
        has_media: false,
        turns: [
          { role: 'user', content: 'Minha internet caiu' },
          { role: 'assistant', content: 'Vou ajudar' },
        ],
        ticket: null,
      };
      const line = JSON.stringify({
        response: {
          status_code: 200,
          body: {
            choices: [{ message: { content: JSON.stringify(valid) } }],
          },
        },
      });
      const out = parseBatchResponseLine(line);
      expect(out).not.toBeNull();
      expect(out?.persona_name).toBe('Fictício da Silva');
      expect(out?.turns).toHaveLength(2);
    });
  });

  describe('buildBatchRequests', () => {
    it('gera N requests com system prompt contendo o mix e a flag de mídia', () => {
      const reqs = buildBatchRequests(
        {
          conversations: 3,
          intentMix: { cobranca: 50, suporte: 50 },
          mediaPct: 10,
        },
        'tenant-x',
      );
      expect(reqs).toHaveLength(3);
      const sys = reqs[0].body.messages[0].content;
      expect(sys).toMatch(/cobranc.{0,20}50%/);
      expect(sys).toMatch(/suporte.{0,20}50%/);
      expect(sys).toMatch(/10%/);
      expect(sys).toMatch(/nunca gere CPF/i);
      expect(sys).toMatch(/FICTÍCIOS/i);
    });

    it('custom_id inclui tenantId', () => {
      const reqs = buildBatchRequests(
        { conversations: 2, intentMix: { a: 100 }, mediaPct: 0 },
        'tenant-abc',
      );
      expect(reqs[0].custom_id).toContain('tenant-abc');
    });
  });
});
