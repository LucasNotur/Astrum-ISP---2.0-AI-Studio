import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhitelabelRateLimit, RedisCache, DB, TenantConfig } from '../../../src/middleware/whitelabelRateLimit';

describe('Whitelabel and Rate Limit Tests', () => {
  let redis: import('vitest').Mocked<RedisCache>;
  let db: import('vitest').Mocked<DB>;
  let middleware: WhitelabelRateLimit;
  let redisStore: Map<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    redisStore = new Map();
    
    redis = {
      get: vi.fn().mockImplementation(async (k) => redisStore.get(k) || null),
      set: vi.fn().mockImplementation(async (k, v) => { redisStore.set(k, v); }),
      incrementAndGet: vi.fn().mockImplementation(async (k) => {
        const val = (redisStore.get(k) || 0) + 1;
        redisStore.set(k, val);
        return val;
      }),
      expire: vi.fn().mockResolvedValue(undefined),
    };

    db = {
      getTenantIdByHost: vi.fn(),
      getTenantConfig: vi.fn(),
      getNationalHolidays: vi.fn().mockResolvedValue(['2026-12-25', '2026-01-01']),
    };

    middleware = new WhitelabelRateLimit(redis, db);
  });

  it('1. Host customizado registrado -> resolve para tenantId correto via Redis cache', async () => {
    db.getTenantIdByHost.mockResolvedValue('tenant-1');
    
    const res1 = await middleware.resolveTenant('app.empresa.com');
    expect(res1.status).toBe(200);
    expect(res1.tenantId).toBe('tenant-1');
    expect(db.getTenantIdByHost).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith('host:app.empresa.com', 'tenant-1');

    // Second call should hit cache
    const res2 = await middleware.resolveTenant('app.empresa.com');
    expect(res2.status).toBe(200);
    expect(res2.tenantId).toBe('tenant-1');
    expect(db.getTenantIdByHost).toHaveBeenCalledTimes(1); // Still 1
  });

  it('2. Host customizado não registrado -> 404 sem expor informação interna', async () => {
    db.getTenantIdByHost.mockResolvedValue(null);
    const res = await middleware.resolveTenant('unknown.com');
    expect(res.status).toBe(404);
    expect(res.tenantId).toBeUndefined();
  });

  it('3. Rate limit FREE (100 req/min): na 101ª request -> 429 com Retry-After', async () => {
    db.getTenantConfig.mockResolvedValue({ id: 't-free', plan: 'FREE' });
    redisStore.set('ratelimit:t-free:minute', 100);

    const res = await middleware.checkRateLimit('t-free');
    expect(res.status).toBe(429);
    expect(res.headers).toEqual({ 'Retry-After': '60' });
  });

  it('4. Rate limit PRO (500 req/min): na 501ª -> 429', async () => {
    db.getTenantConfig.mockResolvedValue({ id: 't-pro', plan: 'PRO' });
    redisStore.set('ratelimit:t-pro:minute', 500);

    const res = await middleware.checkRateLimit('t-pro');
    expect(res.status).toBe(429);
  });

  it('5. Rate limit ENTERPRISE -> nunca retorna 429', async () => {
    db.getTenantConfig.mockResolvedValue({ id: 't-ent', plan: 'ENTERPRISE' });
    redisStore.set('ratelimit:t-ent:minute', 9999);

    const res = await middleware.checkRateLimit('t-ent');
    expect(res.status).toBe(200);
  });

  it('6. Rate limit tenant A não afeta tenant B', async () => {
    db.getTenantConfig.mockImplementation(async (id) => ({ id: id as string, plan: 'FREE' }));
    
    redisStore.set('ratelimit:tenantA:minute', 100);
    redisStore.set('ratelimit:tenantB:minute', 50);

    const resA = await middleware.checkRateLimit('tenantA');
    const resB = await middleware.checkRateLimit('tenantB');

    expect(resA.status).toBe(429);
    expect(resB.status).toBe(200);
  });

  it('7. isHoliday(tenantId, feriado_nacional) -> true', async () => {
    expect(await middleware.isHoliday('t1', '2026-12-25')).toBe(true);
  });

  it('8. isHoliday(tenantId, dia_útil) -> false', async () => {
    expect(await middleware.isHoliday('t1', '2026-05-24')).toBe(false);
  });

  it('9. Job agendado em feriado -> adiado para próximo dia útil', async () => {
    const res = await middleware.scheduleJob('t1', '2026-12-25', {});
    expect(res.scheduledDate).toBe('2026-12-26');
  });

  it('10. Tema do tenant -> CSS variables aplicadas corretamente com primary_color do Firestore', async () => {
    db.getTenantConfig.mockResolvedValue({ id: 't1', plan: 'PRO', primary_color: '#ff0000' });
    
    const res = await middleware.getTenantTheme('t1');
    expect(res.cssVariables).toEqual({ '--primary-color': '#ff0000' });
  });
});
