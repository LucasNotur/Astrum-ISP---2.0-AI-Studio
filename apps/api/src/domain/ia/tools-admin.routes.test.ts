import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Mock do RBAC: ignora permissão (controlamos o user manualmente).
vi.mock('../../infrastructure/auth/rbac.middleware', () => ({
  requirePermission: () => async () => undefined,
}));

// Validadores passam reto para o teste focar só no handler. O mock repassa
// o body/params para validatedBody/validatedParams (sem Zod real).
vi.mock('../../infrastructure/validation/zod-validator', () => ({
  validateBody: () => async (request: any) => {
    request.validatedBody = request.body;
  },
  validateParams: () => async (request: any) => {
    request.validatedParams = request.params;
  },
}));

vi.mock('../../infrastructure/ai/tool-registry', () => ({
  listToolCatalog: vi.fn(),
  setToolEnabled: vi.fn(),
}));

vi.mock('../../infrastructure/ai/vercel-ai.service', () => ({
  agentTools: {
    suspend_signal: { description: 'd1' },
    check_invoice: { description: 'd2' },
    create_ticket: { description: 'd3' },
    query_knowledge_base: { description: 'd4' },
    check_coverage: { description: 'd5' },
    run_diagnostics: { description: 'd6' },
    schedule_technical_visit: { description: 'd7' },
    get_billing_status: { description: 'd8' },
  },
}));

async function buildApp() {
  const app = Fastify();
  // authenticate injeta user fake e segue
  app.decorate('authenticate', async (request: any) => {
    request.user = { userId: 'u1', tenantId: 'tenant-1', role: 'admin' };
  });
  const { toolsAdminRoutes } = await import('./tools-admin.routes');
  await app.register(toolsAdminRoutes);
  return app;
}

describe('tools-admin.routes (IA-19)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/v2/ia/tools devolve o catálogo do registry para o tenant do user', async () => {
    const { listToolCatalog } = await import('../../infrastructure/ai/tool-registry');
    (listToolCatalog as any).mockResolvedValueOnce([
      { name: 'suspend_signal', description: 'd1', enabled: true, calls7d: 12, errors7d: 0 },
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/ia/tools',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual([
      { name: 'suspend_signal', description: 'd1', enabled: true, calls7d: 12, errors7d: 0 },
    ]);
    expect(listToolCatalog).toHaveBeenCalledWith('tenant-1');
  });

  it('PATCH /api/v2/ia/tools/:name chama setToolEnabled e devolve ok', async () => {
    const { setToolEnabled } = await import('../../infrastructure/ai/tool-registry');
    (setToolEnabled as any).mockResolvedValueOnce(true);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v2/ia/tools/suspend_signal',
      headers: { 'content-type': 'application/json' },
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, name: 'suspend_signal', enabled: false });
    expect(setToolEnabled).toHaveBeenCalledWith('tenant-1', 'suspend_signal', false, 'u1');
  });

  it('PATCH /api/v2/ia/tools/:name para tool inexistente → 404', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v2/ia/tools/tool_inexistente',
      headers: { 'content-type': 'application/json' },
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('TOOL_NOT_FOUND');
  });
});
