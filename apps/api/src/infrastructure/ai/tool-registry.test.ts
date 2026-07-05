import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks declarados ANTES do import do SUT. Cada `it` faz vi.resetModules()
// para reavaliar a flag TOOL_REGISTRY_ENABLED do env em runtime.
vi.mock('../cache/redis.client', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

// Mock de supabase.client controlado por fromFn: cada teste pode injetar o
// comportamento da query via mockImplementationOnce. Builder encadeável que
// permite escolher o que a última eq devolve.
function makeChainable(lastEqValue: any) {
  let eqCount = 0;
  const b: any = {
    _lastEq: () => {
      eqCount++;
      if (eqCount >= 2) return lastEqValue;
      return b;
    },
  };
  b.select = vi.fn(() => b);
  b.insert = vi.fn(() => b);
  b.upsert = vi.fn(() => Promise.resolve({ error: null }));
  b.eq = vi.fn(() => b._lastEq());
  b.gte = vi.fn(() => b);
  b.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  return b;
}

const fromFn = vi.fn();

vi.mock('../database/supabase.client', () => ({
  default: { from: fromFn },
}));

vi.mock('./vercel-ai.service', () => ({
  agentTools: {
    suspend_signal: { description: 'suspend' },
    check_invoice: { description: 'check' },
    create_ticket: { description: 'create' },
    query_knowledge_base: { description: 'kb' },
    check_coverage: { description: 'coverage' },
    run_diagnostics: { description: 'diag' },
    schedule_technical_visit: { description: 'visit' },
    get_billing_status: { description: 'bill' },
  },
}));

const ALL_TOOL_NAMES = [
  'check_coverage','check_invoice','create_ticket','get_billing_status',
  'query_knowledge_base','run_diagnostics','schedule_technical_visit','suspend_signal',
];

describe('tool-registry (IA-19)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    fromFn.mockReset();
  });

  async function freshRedis() {
    const { redis } = await import('../cache/redis.client');
    (redis.get as any).mockReset();
    (redis.set as any).mockReset();
    (redis.del as any).mockReset();
    return redis;
  }

  it('flag off → retorna agentTools completo (8 tools) sem tocar Redis nem Supabase', async () => {
    process.env.TOOL_REGISTRY_ENABLED = 'false';
    vi.resetModules();
    const { getEnabledTools } = await import('./tool-registry');
    const { redis } = await import('../cache/redis.client');
    const tools = await getEnabledTools('tenant-1');
    expect(Object.keys(tools).sort()).toEqual([...ALL_TOOL_NAMES].sort());
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('flag on: filtra tools desabilitadas lendo do cache Redis', async () => {
    process.env.TOOL_REGISTRY_ENABLED = 'true';
    vi.resetModules();
    const { redis } = await import('../cache/redis.client');
    (redis.get as any).mockResolvedValueOnce(JSON.stringify(['check_coverage', 'run_diagnostics']));
    const { getEnabledTools } = await import('./tool-registry');
    const tools = await getEnabledTools('tenant-1');
    expect(tools).not.toHaveProperty('check_coverage');
    expect(tools).not.toHaveProperty('run_diagnostics');
    expect(tools).toHaveProperty('suspend_signal');
    expect(tools).toHaveProperty('check_invoice');
  });

  it('flag on + cache miss: carrega do Supabase e cacheia por 60s', async () => {
    process.env.TOOL_REGISTRY_ENABLED = 'true';
    vi.resetModules();
    const { redis } = await import('../cache/redis.client');
    (redis.get as any).mockResolvedValueOnce(null);
    (redis.set as any).mockResolvedValueOnce('OK');
    fromFn.mockImplementationOnce(() =>
      makeChainable(Promise.resolve({
        data: [{ tool_name: 'create_ticket' }],
        error: null,
      })),
    );
    const { getEnabledTools } = await import('./tool-registry');
    const tools = await getEnabledTools('tenant-2');
    expect(tools).not.toHaveProperty('create_ticket');
    expect(tools).toHaveProperty('suspend_signal');
    expect(redis.set).toHaveBeenCalledWith('toolreg:tenant-2', expect.any(String), 'EX', 60);
  });

  it('Redis fora → fail-open (todas as tools)', async () => {
    process.env.TOOL_REGISTRY_ENABLED = 'true';
    vi.resetModules();
    const { redis } = await import('../cache/redis.client');
    (redis.get as any).mockRejectedValueOnce(new Error('redis down'));
    const { getEnabledTools } = await import('./tool-registry');
    const tools = await getEnabledTools('tenant-3');
    expect(Object.keys(tools)).toHaveLength(8);
  });

  it('Supabase fora → fail-open (todas as tools)', async () => {
    process.env.TOOL_REGISTRY_ENABLED = 'true';
    vi.resetModules();
    const { redis } = await import('../cache/redis.client');
    (redis.get as any).mockResolvedValueOnce(null);
    fromFn.mockImplementationOnce(() => makeChainable(Promise.reject(new Error('db down'))));
    const { getEnabledTools } = await import('./tool-registry');
    const tools = await getEnabledTools('tenant-4');
    expect(Object.keys(tools)).toHaveLength(8);
  });

  it('setToolEnabled recusa tool fora do catálogo', async () => {
    vi.resetModules();
    const { setToolEnabled } = await import('./tool-registry');
    const ok = await setToolEnabled('t', 'nao_existe', true);
    expect(ok).toBe(false);
  });

  it('setToolEnabled faz upsert + invalida cache quando flag on e sucesso', async () => {
    process.env.TOOL_REGISTRY_ENABLED = 'true';
    vi.resetModules();
    const { redis } = await import('../cache/redis.client');
    (redis.del as any).mockResolvedValueOnce(1);
    fromFn.mockImplementationOnce(() => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }));
    const { setToolEnabled } = await import('./tool-registry');
    const ok = await setToolEnabled('tenant-5', 'suspend_signal', false, 'admin@x');
    expect(ok).toBe(true);
    expect(redis.del).toHaveBeenCalledWith('toolreg:tenant-5');
  });

  it('invalidateToolRegistry é no-op com flag off', async () => {
    process.env.TOOL_REGISTRY_ENABLED = 'false';
    vi.resetModules();
    const redis = await freshRedis();
    const { invalidateToolRegistry } = await import('./tool-registry');
    await invalidateToolRegistry('t');
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('recordToolUsage é no-op com flag off', async () => {
    process.env.TOOL_REGISTRY_ENABLED = 'false';
    vi.resetModules();
    const { recordToolUsage } = await import('./tool-registry');
    expect(() => recordToolUsage('t', 'x', { error: 'fail' })).not.toThrow();
  });
});
