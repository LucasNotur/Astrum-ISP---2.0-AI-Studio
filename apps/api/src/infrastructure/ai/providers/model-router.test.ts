import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks devem vir ANTES de importar o model-router (hoisted).
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    APICallError: class APICallError extends Error {
      readonly statusCode?: number;
      readonly isRetryable: boolean;
      constructor(opts: { message: string; statusCode?: number; isRetryable?: boolean }) {
        super(opts.message);
        this.name = 'APICallError';
        this.statusCode = opts.statusCode;
        this.isRetryable = opts.isRetryable ?? false;
      }
      static isInstance(err: unknown): err is APICallError {
        return err instanceof APICallError;
      }
    },
  };
});

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn((id: string) => ({ provider: 'openai', modelId: id })),
}));
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn((id: string) => ({ provider: 'anthropic', modelId: id })),
}));
vi.mock('@ai-sdk/google', () => ({
  google: vi.fn((id: string) => ({ provider: 'google', modelId: id })),
}));

const redisStore = new Map<string, { value: string; expiresAt: number | null }>();
vi.mock('../../../infrastructure/cache/redis.client', () => {
  const getOrExpire = (key: string) => {
    const item = redisStore.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      redisStore.delete(key);
      return null;
    }
    return item.value;
  };
  return {
    redis: {
      get: vi.fn(async (key: string) => getOrExpire(key)),
      set: vi.fn(async (key: string, value: string, ...args: any[]) => {
        let expiresAt: number | null = null;
        for (let i = 0; i < args.length; i++) {
          if (args[i] === 'EX') expiresAt = Date.now() + Number(args[i + 1]) * 1000;
          if (args[i] === 'PX') expiresAt = Date.now() + Number(args[i + 1]);
        }
        redisStore.set(key, { value, expiresAt });
        return 'OK';
      }),
      incr: vi.fn(async (key: string) => {
        const cur = Number(getOrExpire(key) ?? '0') + 1;
        const existing = redisStore.get(key);
        redisStore.set(key, { value: String(cur), expiresAt: existing?.expiresAt ?? null });
        return cur;
      }),
      expire: vi.fn(async (key: string, ttl: number) => {
        const cur = redisStore.get(key);
        if (cur) {
          redisStore.set(key, { value: cur.value, expiresAt: Date.now() + ttl * 1000 });
          return 1;
        }
        return 0;
      }),
      del: vi.fn(async (key: string) => (redisStore.delete(key) ? 1 : 0)),
      setnx: vi.fn(async (key: string, value: string) => {
        if (redisStore.has(key)) return null;
        redisStore.set(key, { value, expiresAt: null });
        return 1;
      }),
    },
  };
});

vi.mock('../../../infrastructure/logging/logger', () => ({
  iaLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  getModel,
  withFailover,
  isFailoverEnabled,
  isRetryableError,
  resolveProviderOrder,
  getProviderApiKey,
  getCircuitState,
  TIER_MODELS,
  type ProviderName,
  type Tier,
} from './model-router';
import { APICallError } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';

const originalEnv = { ...process.env };

beforeEach(() => {
  // Reset Redis mock store entre testes
  redisStore.clear();
  // Reset env para default seguro
  process.env = { ...originalEnv };
  delete process.env.PROVIDER_FAILOVER_ENABLED;
  delete process.env.PROVIDER_ORDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = originalEnv;
});

describe('isFailoverEnabled', () => {
  it('default false', () => {
    expect(isFailoverEnabled()).toBe(false);
  });
  it('liga com PROVIDER_FAILOVER_ENABLED=true', () => {
    process.env.PROVIDER_FAILOVER_ENABLED = 'true';
    expect(isFailoverEnabled()).toBe(true);
  });
  it('case/whitespace insensitive', () => {
    process.env.PROVIDER_FAILOVER_ENABLED = ' TRUE ';
    expect(isFailoverEnabled()).toBe(true);
  });
});

describe('resolveProviderOrder', () => {
  it('default openai', () => {
    expect(resolveProviderOrder()).toEqual(['openai']);
  });
  it('respeita PROVIDER_ORDER', () => {
    process.env.PROVIDER_ORDER = 'anthropic,google,openai';
    expect(resolveProviderOrder()).toEqual(['anthropic', 'google', 'openai']);
  });
  it('ignora providers inválidos', () => {
    process.env.PROVIDER_ORDER = 'openai,foo,anthropic';
    expect(resolveProviderOrder()).toEqual(['openai', 'anthropic']);
  });
});

describe('getProviderApiKey', () => {
  it('openai → OPENAI_API_KEY', () => {
    process.env.OPENAI_API_KEY = 'sk-123';
    expect(getProviderApiKey('openai')).toBe('sk-123');
  });
  it('anthropic → ANTHROPIC_API_KEY', () => {
    process.env.ANTHROPIC_API_KEY = 'ant-123';
    expect(getProviderApiKey('anthropic')).toBe('ant-123');
  });
  it('google → GOOGLE_API_KEY preferencial; cai no GEMINI_API_KEY (legado)', () => {
    process.env.GEMINI_API_KEY = 'gem-123';
    expect(getProviderApiKey('google')).toBe('gem-123');
    process.env.GOOGLE_API_KEY = 'goog-123';
    expect(getProviderApiKey('google')).toBe('goog-123');
  });
});

describe('getModel — flag off', () => {
  it('sempre devolve openai, qualquer PROVIDER_ORDER', () => {
    process.env.PROVIDER_ORDER = 'anthropic,google,openai';
    process.env.OPENAI_API_KEY = 'sk-1';
    process.env.ANTHROPIC_API_KEY = 'ant-1';
    process.env.GOOGLE_API_KEY = 'goog-1';
    const m = getModel('full');
    expect(openai).toHaveBeenCalledWith('gpt-4o');
    expect((m as any).provider).toBe('openai');
    expect((m as any).modelId).toBe('gpt-4o');
  });
  it('respeita o tier', () => {
    expect((getModel('mini') as any).modelId).toBe('gpt-4o-mini');
    expect((getModel('full') as any).modelId).toBe('gpt-4o');
  });
});

describe('getModel — flag on', () => {
  beforeEach(() => {
    process.env.PROVIDER_FAILOVER_ENABLED = 'true';
  });

  it('pega o 1º provider da ordem com key presente', () => {
    process.env.PROVIDER_ORDER = 'anthropic,openai';
    process.env.OPENAI_API_KEY = 'sk-1';
    process.env.ANTHROPIC_API_KEY = 'ant-1';
    const m = getModel('full');
    expect(anthropic).toHaveBeenCalledWith(TIER_MODELS.anthropic.full);
    expect((m as any).provider).toBe('anthropic');
  });

  it('pula provider sem key', () => {
    process.env.PROVIDER_ORDER = 'anthropic,openai';
    process.env.OPENAI_API_KEY = 'sk-1';
    // sem ANTHROPIC_API_KEY
    const m = getModel('mini');
    expect((m as any).provider).toBe('openai');
    expect((m as any).modelId).toBe('gpt-4o-mini');
  });

  it('fail-open: se nenhum provider tem key, cai no openai', () => {
    process.env.PROVIDER_ORDER = 'anthropic,google';
    const m = getModel('full');
    expect((m as any).provider).toBe('openai');
  });
});

describe('TIER_MODELS', () => {
  it('tem ids para os 3 providers nos 2 tiers', () => {
    const providers: ProviderName[] = ['openai', 'anthropic', 'google'];
    const tiers: Tier[] = ['mini', 'full'];
    for (const p of providers) for (const t of tiers) {
      expect(typeof TIER_MODELS[p][t]).toBe('string');
      expect(TIER_MODELS[p][t].length).toBeGreaterThan(0);
    }
  });
});

describe('isRetryableError — classificação portada do legado', () => {
  it('5xx é retryable', () => {
    expect(isRetryableError(new APICallError({ message: 'internal', statusCode: 502 }))).toBe(true);
    expect(isRetryableError(new APICallError({ message: 'service', statusCode: 503 }))).toBe(true);
  });
  it('429 (rate-limit) e 408 (timeout) são retryable', () => {
    expect(isRetryableError(new APICallError({ message: 'rl', statusCode: 429 }))).toBe(true);
    expect(isRetryableError(new APICallError({ message: 'to', statusCode: 408 }))).toBe(true);
  });
  it('4xx de conteúdo NÃO é retryable', () => {
    expect(isRetryableError(new APICallError({ message: 'bad req', statusCode: 400 }))).toBe(false);
    expect(isRetryableError(new APICallError({ message: 'forbidden', statusCode: 403 }))).toBe(false);
    expect(isRetryableError(new APICallError({ message: 'not found', statusCode: 404 }))).toBe(false);
  });
  it('isRetryable=true (hint do provider) é retryable mesmo com 4xx', () => {
    expect(isRetryableError(new APICallError({ message: 'x', statusCode: 408, isRetryable: true }))).toBe(true);
  });
  it('APICallError sem statusCode é retryable (fail-safe)', () => {
    expect(isRetryableError(new APICallError({ message: 'unknown' }))).toBe(true);
  });
  it('ECONNRESET/ETIMEDOUT são retryable', () => {
    const mk = (code: string) => Object.assign(new Error('x'), { code });
    expect(isRetryableError(mk('ECONNRESET'))).toBe(true);
    expect(isRetryableError(mk('ETIMEDOUT'))).toBe(true);
    expect(isRetryableError(mk('ENOTFOUND'))).toBe(true);
  });
  it('mensagem de timeout/network é retryable', () => {
    expect(isRetryableError(new Error('Request timeout'))).toBe(true);
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableError(new Error('socket hang up'))).toBe(true);
  });
  it('erro de validação (AISDKError) NÃO é retryable', () => {
    expect(isRetryableError(new Error('Invalid argument: schema mismatch'))).toBe(false);
  });
});

describe('getCircuitState', () => {
  it('CLOSED quando não há chaves', async () => {
    expect(await getCircuitState('openai')).toBe('closed');
  });
  it('OPEN quando há llm_circuit:openai=OPEN', async () => {
    redisStore.set('llm_circuit:openai', { value: 'OPEN', expiresAt: null });
    expect(await getCircuitState('openai')).toBe('open');
  });
  it('HALF_OPEN quando só recent_open está setado', async () => {
    redisStore.set('llm_circuit:recent_open:openai', { value: '1', expiresAt: null });
    expect(await getCircuitState('openai')).toBe('half-open');
  });
});

describe('withFailover — flag off', () => {
  it('não consulta Redis, vai direto no openai', async () => {
    process.env.OPENAI_API_KEY = 'sk-1';
    const fn = vi.fn(async (m: any) => `ok:${m.modelId}`);
    const result = await withFailover('mini', fn);
    expect(result).toBe('ok:gpt-4o-mini');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withFailover — flag on', () => {
  beforeEach(() => {
    process.env.PROVIDER_FAILOVER_ENABLED = 'true';
  });

  it('roda no 1º provider da ordem', async () => {
    process.env.PROVIDER_ORDER = 'openai,anthropic';
    process.env.OPENAI_API_KEY = 'sk-1';
    process.env.ANTHROPIC_API_KEY = 'ant-1';
    const fn = vi.fn(async (m: any) => m.modelId);
    const result = await withFailover('full', fn, 'tenant-1');
    expect(result).toBe('gpt-4o');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('pula provider sem key', async () => {
    process.env.PROVIDER_ORDER = 'anthropic,openai';
    process.env.OPENAI_API_KEY = 'sk-1';
    // sem ANTHROPIC_API_KEY
    const fn = vi.fn(async (m: any) => m.provider);
    const result = await withFailover('full', fn, 't1');
    expect(result).toBe('openai');
  });

  it('pula provider com circuito OPEN', async () => {
    process.env.PROVIDER_ORDER = 'openai,anthropic';
    process.env.OPENAI_API_KEY = 'sk-1';
    process.env.ANTHROPIC_API_KEY = 'ant-1';
    redisStore.set('llm_circuit:openai', { value: 'OPEN', expiresAt: null });
    const fn = vi.fn(async (m: any) => m.provider);
    const result = await withFailover('full', fn, 't1');
    expect(result).toBe('anthropic');
  });

  it('erro retryável faz failover para o próximo', async () => {
    process.env.PROVIDER_ORDER = 'openai,anthropic';
    process.env.OPENAI_API_KEY = 'sk-1';
    process.env.ANTHROPIC_API_KEY = 'ant-1';
    const fn = vi.fn()
      .mockImplementationOnce(async (m: any) => {
        // 1ª chamada (openai) — falha retryable
        throw new APICallError({ message: 'overloaded', statusCode: 503 });
      })
      .mockImplementationOnce(async (m: any) => m.provider); // 2ª chamada (anthropic) — sucesso
    const result = await withFailover('full', fn, 't1');
    expect(result).toBe('anthropic');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('erro NÃO-retryável NÃO faz failover — propaga imediatamente', async () => {
    process.env.PROVIDER_ORDER = 'openai,anthropic';
    process.env.OPENAI_API_KEY = 'sk-1';
    process.env.ANTHROPIC_API_KEY = 'ant-1';
    const fn = vi.fn()
      .mockImplementationOnce(async () => {
        throw new APICallError({ message: 'bad request', statusCode: 400 });
      });
    await expect(withFailover('full', fn, 't1')).rejects.toThrow(/bad request/);
    expect(fn).toHaveBeenCalledTimes(1); // nem tentou o anthropic
  });

  it('se TODOS falharem, propaga o último erro', async () => {
    process.env.PROVIDER_ORDER = 'openai,anthropic,google';
    process.env.OPENAI_API_KEY = 'sk-1';
    process.env.ANTHROPIC_API_KEY = 'ant-1';
    process.env.GOOGLE_API_KEY = 'goog-1';
    const fn = vi.fn(async () => {
      throw new APICallError({ message: 'all down', statusCode: 503 });
    });
    await expect(withFailover('full', fn, 't1')).rejects.toThrow(/all down/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('log provider_failover com from/to/reason/tenantId', async () => {
    const { iaLogger } = await import('../../../infrastructure/logging/logger');
    process.env.PROVIDER_ORDER = 'openai,anthropic';
    process.env.OPENAI_API_KEY = 'sk-1';
    process.env.ANTHROPIC_API_KEY = 'ant-1';
    const fn = vi.fn()
      .mockImplementationOnce(async (m: any) => {
        // 1ª chamada (openai) — falha retryable
        throw new APICallError({ message: 'boom', statusCode: 502 });
      })
      .mockImplementationOnce(async (m: any) => m.provider); // 2ª chamada (anthropic) — sucesso
    await withFailover('full', fn, 'tenant-99');
    const warnCalls = (iaLogger.warn as any).mock.calls;
    const failoverLog = warnCalls.find((c: any[]) => c[0]?.event === 'provider_failover');
    expect(failoverLog).toBeDefined();
    expect(failoverLog[0]).toMatchObject({
      event: 'provider_failover',
      from: 'openai',
      to: 'anthropic',
      reason: 'boom',
      tenantId: 'tenant-99',
    });
  });

  it('registra 3 falhas e abre o circuito do provider (portado)', async () => {
    process.env.PROVIDER_ORDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-1';
    const fn = vi.fn(async () => {
      throw new APICallError({ message: 'flaky', statusCode: 500 });
    });
    // 3 chamadas
    for (let i = 0; i < 3; i++) {
      await expect(withFailover('full', fn, 't1')).rejects.toThrow();
    }
    expect(await getCircuitState('openai')).toBe('open');
  });
});
