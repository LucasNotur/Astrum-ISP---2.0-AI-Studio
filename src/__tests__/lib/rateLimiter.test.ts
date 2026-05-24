import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { acquireSendSlot, checkBanSignal } from '../../lib/rateLimiter.ts';

const { redisMock, mockDbGet, mockAdd } = vi.hoisted(() => {
  const Redis = require('ioredis-mock');
  const redisMock = new Redis();
  const mockDbGet = vi.fn();
  const mockAdd = vi.fn();
  return { redisMock, mockDbGet, mockAdd };
});

// Mock Redis
vi.mock('../../lib/redis.ts', () => {
  return {
    default: redisMock
  };
});

vi.mock('../../lib/firebaseAdmin.ts', () => {
  return {
    adminDb: {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: mockDbGet
        })),
        add: mockAdd
      }))
    },
    default: {
      firestore: {
        FieldValue: {
          serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP')
        }
      }
    }
  };
});

vi.mock('../../lib/logger.ts', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('Rate Limiter Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await redisMock.flushall();
    
    // Default db mock to not found
    mockDbGet.mockResolvedValue({ exists: false });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('1. acquireSendSlot abaixo do limite (29/30) -> { allowed: true }', async () => {
    // Make 29 requests
    for (let i = 0; i < 29; i++) {
        const { allowed } = await acquireSendSlot('tenantA', 'inst1', 30);
        expect(allowed).toBe(true);
    }
    
    // Check 30th request is also allowed since it is < 30
    const { allowed } = await acquireSendSlot('tenantA', 'inst1', 30);
    expect(allowed).toBe(true); // Now we have 30 items
  });

  it('2. acquireSendSlot no limite exato (30/30) -> { allowed: false, retryAfter: número > 0 }', async () => {
    // Need to mock Date.now so they all fall in the same window
    vi.setSystemTime(new Date(10000000));
    
    // Make 30 requests
    for (let i = 0; i < 30; i++) {
        await acquireSendSlot('tenantA', 'inst2', 30);
    }
    
    // The 31st request should be throttled
    const { allowed, retryAfter } = await acquireSendSlot('tenantA', 'inst2', 30);
    expect(allowed).toBe(false);
    expect(retryAfter).toBeGreaterThan(0);
    
    // Reset time mock
    vi.useRealTimers();
  });

  it('3. Após 1 segundo (sliding window) -> contador reseta e permite novos envios', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(20000000));
    
    for (let i = 0; i < 30; i++) {
        await acquireSendSlot('tenantA', 'inst3', 30);
    }
    let res = await acquireSendSlot('tenantA', 'inst3', 30);
    expect(res.allowed).toBe(false);

    // Advance 1.1 seconds
    vi.advanceTimersByTime(1100);
    // After advancing, we also need to allow zremrangebyscore to actually remove them.
    // Wait, ioredis-mock zremrangebyscore uses the current timestamp passed to it, which is Date.now(). 
    // And since we advanced vitest timers, Date.now() should reflect that.
    
    res = await acquireSendSlot('tenantA', 'inst3', 30);
    expect(res.allowed).toBe(true);
    
    vi.useRealTimers();
  });

  it('4. Tenant A no limite -> tenant B NÃO é bloqueado (limites independentes)', async () => {
    vi.setSystemTime(new Date(30000000));
    
    for (let i = 0; i < 30; i++) {
        await acquireSendSlot('tenantA', 'inst4', 30);
    }
    
    const resA = await acquireSendSlot('tenantA', 'inst4', 30);
    expect(resA.allowed).toBe(false);

    const resB = await acquireSendSlot('tenantB', 'inst4', 30);
    expect(resB.allowed).toBe(true);
    
    vi.useRealTimers();
  });

  it('5. Ban signal >= 3 para mesma instância -> pausa jobs e registra WHATSAPP_BAN_RISK no audit', async () => {
    // Generate mock responses
    const mockRes1 = { status: 403, clone: () => ({ text: async () => '' }) } as unknown as Response;
    const mockRes2 = { status: 403, clone: () => ({ text: async () => '' }) } as unknown as Response;
    const mockRes3 = { status: 403, clone: () => ({ text: async () => '' }) } as unknown as Response;

    await checkBanSignal(mockRes1, 'tenantA', 'target-inst');
    await checkBanSignal(mockRes2, 'tenantA', 'target-inst');
    
    // Until 2, not yet paused
    expect(await redisMock.get('pause_jobs:target-inst')).toBe(null);
    expect(mockAdd).toHaveBeenCalledTimes(0);

    await checkBanSignal(mockRes3, 'tenantA', 'target-inst');
    
    // Now paused
    expect(await redisMock.get('pause_jobs:target-inst')).toBe('paused');
    expect(mockAdd).toHaveBeenCalledTimes(2); // one for notifications, one for audit_logs
    
    // Audit collection was called
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
       action: 'WHATSAPP_BAN_RISK',
       details: 'Instância target-inst pode ter sido banida/bloqueada.'
    }));
  });

  it('6. Ban signal de instância A -> instância B do mesmo tenant não é afetada', async () => {
    const mockRes1 = { status: 403, clone: () => ({ text: async () => '' }) } as unknown as Response;
    const mockRes2 = { status: 403, clone: () => ({ text: async () => '' }) } as unknown as Response;
    const mockRes3 = { status: 403, clone: () => ({ text: async () => '' }) } as unknown as Response;

    await checkBanSignal(mockRes1, 'tenantA', 'instA');
    await checkBanSignal(mockRes2, 'tenantA', 'instA');
    await checkBanSignal(mockRes3, 'tenantA', 'instA');
    
    expect(await redisMock.get('pause_jobs:instA')).toBe('paused');
    expect(await redisMock.get('pause_jobs:instB')).toBe(null);
  });

  it('7. acquireSendSlot com rate_limit customizado no tenant -> usa o valor do tenant, não o padrão', async () => {
    // Return custom rate limit = 10
    mockDbGet.mockResolvedValue({
        exists: true,
        data: () => ({ rate_limit: 10 })
    });

    vi.setSystemTime(new Date(40000000));
    
    // We send 10 requests, where it should normally be 30.
    // If it uses custom limit, the 11th will fail.
    for (let i = 0; i < 10; i++) {
        // pass undefined to limitPerSecond parameter forces it to check DB
        const { allowed } = await acquireSendSlot('tenant-custom', 'instC'); 
        expect(allowed).toBe(true);
    }
    
    // The 11th request will fail
    const { allowed } = await acquireSendSlot('tenant-custom', 'instC'); 
    expect(allowed).toBe(false);
    
    // DB was called
    expect(mockDbGet).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
