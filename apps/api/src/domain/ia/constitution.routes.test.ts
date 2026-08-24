import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/guardrails/constitution.service', () => ({
  getConstitution: vi.fn(),
  saveConstitution: vi.fn(),
  isConstitutionalLoopEnabled: vi.fn(),
}));

import { getConstitution, saveConstitution, isConstitutionalLoopEnabled } from '../../infrastructure/guardrails/constitution.service';
import { constitutionRoutes } from './constitution.routes';

async function buildApp(user: Record<string, any> = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(constitutionRoutes);
  await app.ready();
  return app;
}

describe('constitution.routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET com tenantId -> devolve princípios do tenant', async () => {
    (getConstitution as any).mockResolvedValue(['p1']);
    (isConstitutionalLoopEnabled as any).mockReturnValue(true);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/constitution' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ principles: ['p1'], enabled: true });
    expect(getConstitution).toHaveBeenCalledWith('tenant-1');
  });

  it('GET com JWT shape antigo (tenant_id) -> vazio, não vaza dado de outro tenant', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/constitution' });
    expect(res.json()).toEqual({ principles: [], enabled: false });
    expect(getConstitution).not.toHaveBeenCalled();
  });

  it('PUT com tenantId -> repassa o userId real (não mais undefined) pro service', async () => {
    (saveConstitution as any).mockResolvedValue({ ok: true });
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/api/v2/ia/constitution', payload: { principles: ['a'] } });
    expect(res.statusCode).toBe(200);
    expect(saveConstitution).toHaveBeenCalledWith('tenant-1', ['a'], 'op-1');
  });

  it('PUT com JWT shape antigo (tenant_id) -> 401', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'PUT', url: '/api/v2/ia/constitution', payload: { principles: ['a'] } });
    expect(res.statusCode).toBe(401);
    expect(saveConstitution).not.toHaveBeenCalled();
  });

  it('PUT com principles não-array -> 400', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/api/v2/ia/constitution', payload: { principles: 'nope' } });
    expect(res.statusCode).toBe(400);
  });
});
