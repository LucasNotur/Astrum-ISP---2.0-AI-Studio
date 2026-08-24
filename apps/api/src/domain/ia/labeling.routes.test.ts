import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../ml/active-learning.service', () => ({
  getPendingExamples: vi.fn(),
  labelExample: vi.fn(),
  exportExamples: vi.fn(),
  isActiveLearningEnabled: vi.fn(),
}));

import { getPendingExamples, labelExample, exportExamples, isActiveLearningEnabled } from '../ml/active-learning.service';
import { labelingRoutes } from './labeling.routes';

async function buildApp(user: Record<string, any> = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(labelingRoutes);
  await app.ready();
  return app;
}

describe('labeling.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isActiveLearningEnabled as any).mockReturnValue(true);
  });

  it('GET queue com tenantId -> devolve fila do tenant', async () => {
    (getPendingExamples as any).mockResolvedValue([{ id: 'e1' }]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/labeling/queue' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ queue: [{ id: 'e1' }], enabled: true });
    expect(getPendingExamples).toHaveBeenCalledWith('tenant-1', 20);
  });

  it('GET queue com JWT shape antigo (tenant_id) -> fila vazia', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/labeling/queue' });
    expect(res.json()).toEqual({ queue: [] });
    expect(getPendingExamples).not.toHaveBeenCalled();
  });

  it('POST label com tenantId -> ok', async () => {
    (labelExample as any).mockResolvedValue(true);
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v2/ia/labeling/e1/label', payload: { label: 'positive' } });
    expect(res.statusCode).toBe(200);
    expect(labelExample).toHaveBeenCalledWith('tenant-1', 'e1', 'positive');
  });

  it('POST label com JWT shape antigo (tenant_id) -> 401', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'POST', url: '/api/v2/ia/labeling/e1/label', payload: { label: 'positive' } });
    expect(res.statusCode).toBe(401);
  });

  it('GET export com JWT shape antigo (tenant_id) -> 401', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/labeling/export' });
    expect(res.statusCode).toBe(401);
    expect(exportExamples).not.toHaveBeenCalled();
  });
});
