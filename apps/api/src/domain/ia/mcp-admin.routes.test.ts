import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/mcp/mcp-server', () => ({
  isMcpEnabled: vi.fn(),
  createKey: vi.fn(),
  listKeys: vi.fn(),
  updateKey: vi.fn(),
  deleteKey: vi.fn(),
  authenticateKey: vi.fn(),
  resolveTools: vi.fn(),
}));

vi.mock('../../infrastructure/ai/tool-registry', () => ({
  READ_ONLY_TOOLS: ['check_invoice'],
  recordToolUsage: vi.fn(),
}));

vi.mock('../../infrastructure/ai/tools.executor', () => ({
  ToolsExecutor: vi.fn(),
}));

import { listKeys, createKey, updateKey, deleteKey } from '../../infrastructure/mcp/mcp-server';
import { mcpAdminRoutes } from './mcp-admin.routes';

async function buildApp(user: Record<string, any> = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(mcpAdminRoutes);
  await app.ready();
  return app;
}

describe('mcp-admin.routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET keys com tenantId -> lista chaves do tenant', async () => {
    (listKeys as any).mockResolvedValue([{ id: 'k1' }]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/mcp/keys' });
    expect(res.statusCode).toBe(200);
    expect(listKeys).toHaveBeenCalledWith('tenant-1');
  });

  it('GET keys com JWT shape antigo (tenant_id) -> lista vazia', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/mcp/keys' });
    expect(res.json()).toEqual({ keys: [] });
    expect(listKeys).not.toHaveBeenCalled();
  });

  it('POST keys com tenantId -> 201 e cria a chave no tenant certo', async () => {
    (createKey as any).mockResolvedValue({ id: 'k1', apiKey: 'sk-xxx' });
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v2/ia/mcp/keys', payload: { name: 'n8n', tools: ['check_invoice'] } });
    expect(res.statusCode).toBe(201);
    expect(createKey).toHaveBeenCalledWith('tenant-1', 'n8n', ['check_invoice']);
  });

  it('POST keys com JWT shape antigo (tenant_id) -> 401', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'POST', url: '/api/v2/ia/mcp/keys', payload: { name: 'n8n', tools: ['check_invoice'] } });
    expect(res.statusCode).toBe(401);
    expect(createKey).not.toHaveBeenCalled();
  });

  it('PATCH keys/:id com JWT shape antigo (tenant_id) -> 401', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'PATCH', url: '/api/v2/ia/mcp/keys/k1', payload: { enabled: false } });
    expect(res.statusCode).toBe(401);
    expect(updateKey).not.toHaveBeenCalled();
  });

  it('DELETE keys/:id com JWT shape antigo (tenant_id) -> 401', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'DELETE', url: '/api/v2/ia/mcp/keys/k1' });
    expect(res.statusCode).toBe(401);
    expect(deleteKey).not.toHaveBeenCalled();
  });
});
