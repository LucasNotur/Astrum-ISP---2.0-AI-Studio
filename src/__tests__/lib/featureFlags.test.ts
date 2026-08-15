import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTenantPlanId } from '../../lib/featureFlags.ts';

// Mocks
const mockDbGet = vi.fn();
vi.mock('../../lib/firebaseAdmin.ts', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: mockDbGet
      }))
    }))
  },
  adminAuth: {
    verifyIdToken: vi.fn()
  }
}));

const mockRedisGet = vi.fn();
const mockRedisSetex = vi.fn();

vi.mock('../../lib/redis.ts', () => ({
  default: {
    get: (...args: any[]) => mockRedisGet(...args),
    setex: (...args: any[]) => mockRedisSetex(...args)
  }
}));

// ⚠️ O gating por feature/limite do modelo antigo (checkFeatureAccess/checkLimit/
// requireFeature + PLANS FREE/PRO/BUSINESS/ENTERPRISE) foi REMOVIDO na migração para
// a Escada Astrum — o acesso hoje é por MÓDULO (modulesForTier/enabled_modules).
// Resta apenas getTenantPlanId (leitura + cache do plan_id do tenant).
describe('getTenantPlanId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cache miss: lê o plan_id do tenant no Firestore e grava no Redis (setex 600s)', async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockDbGet.mockResolvedValueOnce({ exists: true, data: () => ({ plan_id: 'astrum' }) });

    const planId = await getTenantPlanId('t-1');

    expect(planId).toBe('astrum');
    expect(mockDbGet).toHaveBeenCalledTimes(1);
    expect(mockRedisSetex).toHaveBeenCalledWith('tenant_plan:t-1', 600, 'astrum');
  });

  it('tenant sem plan_id -> default "FREE"', async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockDbGet.mockResolvedValueOnce({ exists: true, data: () => ({}) });

    const planId = await getTenantPlanId('t-2');
    expect(planId).toBe('FREE');
  });

  it('tenant inexistente -> default "FREE"', async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    mockDbGet.mockResolvedValueOnce({ exists: false });

    const planId = await getTenantPlanId('t-3');
    expect(planId).toBe('FREE');
  });

  it('cache hit: segunda chamada não bate no Firestore', async () => {
    // 1ª chamada: miss -> DB -> setex
    mockRedisGet.mockResolvedValueOnce(null);
    mockDbGet.mockResolvedValueOnce({ exists: true, data: () => ({ plan_id: 'astrum' }) });
    await getTenantPlanId('t-cache');

    // 2ª chamada: hit no cache -> NÃO busca no DB
    mockRedisGet.mockResolvedValueOnce('astrum');
    const planId = await getTenantPlanId('t-cache');

    expect(planId).toBe('astrum');
    expect(mockRedisGet).toHaveBeenCalledTimes(2);
    expect(mockDbGet).toHaveBeenCalledTimes(1);
    expect(mockRedisSetex).toHaveBeenCalledTimes(1);
  });
});
