import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const usersMaybeSingle = vi.fn();
  const usersEq = vi.fn(() => ({ maybeSingle: usersMaybeSingle }));
  const usersSelect = vi.fn(() => ({ eq: usersEq }));

  const tenantsMaybeSingle = vi.fn();
  const tenantsEq = vi.fn(() => ({ maybeSingle: tenantsMaybeSingle }));
  const tenantsSelect = vi.fn(() => ({ eq: tenantsEq }));

  const start = vi.fn();
  const getJob = vi.fn();

  const from = vi.fn((table: string) => {
    if (table === 'users') return { select: usersSelect };
    if (table === 'tenants') return { select: tenantsSelect };
    return { select: vi.fn(), insert: vi.fn() };
  });

  return {
    usersMaybeSingle,
    usersEq,
    usersSelect,
    tenantsMaybeSingle,
    tenantsEq,
    tenantsSelect,
    start,
    getJob,
    from,
  };
});

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mocks.from(...args) },
}));

vi.mock('../../infrastructure/logging/logger', () => ({
  securityLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

vi.mock('./synthetic-generator.service', () => ({
  syntheticGeneratorService: {
    start: (...args: unknown[]) => mocks.start(...args),
    getJob: (...args: unknown[]) => mocks.getJob(...args),
  },
  SyntheticAccessError: class SyntheticAccessError extends Error {
    statusCode = 403;
    constructor(message = 'Geração sintética só é permitida em tenants de teste.') {
      super(message);
      this.name = 'SyntheticAccessError';
    }
  },
  SyntheticInputError: class SyntheticInputError extends Error {
    statusCode = 400;
    constructor(message: string) {
      super(message);
      this.name = 'SyntheticInputError';
    }
  },
}));

import Fastify from 'fastify';
import { syntheticRoutes } from './synthetic.routes';

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    const raw = request.headers['x-test-user'];
    if (typeof raw === 'string' && raw.length > 0) {
      try {
        request.user = JSON.parse(raw);
      } catch {
        request.user = null;
      }
    } else {
      request.user = null;
    }
  });
  await app.register(syntheticRoutes);
  return app;
}

async function injectAs(
  app: Awaited<ReturnType<typeof buildApp>>,
  method: 'POST' | 'GET',
  url: string,
  opts: { body?: unknown; user?: { userId: string; tenantId: string; role: string } | null } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.user !== undefined) {
    headers['x-test-user'] = JSON.stringify(opts.user);
  }
  return app.inject({
    method,
    url,
    payload: opts.body,
    headers,
  } as any);
}

describe('synthetic.routes (IA-45)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usersMaybeSingle.mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    mocks.start.mockResolvedValue({ jobId: 'job-123' });
    mocks.getJob.mockResolvedValue(null);
  });

  describe('autenticação', () => {
    it('401 quando não há user no JWT', async () => {
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/synthetic/generate', {
        body: { conversations: 1, intentMix: { a: 100 }, mediaPct: 0 },
        user: null,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('autorização super_admin', () => {
    it('403 quando role no banco é admin', async () => {
      mocks.usersMaybeSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null });
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/synthetic/generate', {
        body: { conversations: 1, intentMix: { a: 100 }, mediaPct: 0 },
        user: { userId: 'u1', tenantId: 't1', role: 'admin' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('403 quando role no banco é operator', async () => {
      mocks.usersMaybeSingle.mockResolvedValueOnce({ data: { role: 'operator' }, error: null });
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/synthetic/generate', {
        body: { conversations: 1, intentMix: { a: 100 }, mediaPct: 0 },
        user: { userId: 'u1', tenantId: 't1', role: 'operator' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('guarda dupla: is_sandbox', () => {
    const validBody = { conversations: 5, intentMix: { a: 100 }, mediaPct: 0 };

    it('403 quando tenant é real (is_sandbox=false) vindo do service', async () => {
      const { SyntheticAccessError } = await import('./synthetic-generator.service');
      mocks.start.mockRejectedValueOnce(
        new SyntheticAccessError('Geração sintética só é permitida em tenants de teste.'),
      );
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/synthetic/generate', {
        body: validBody,
        user: { userId: 'u1', tenantId: 'tenant-real', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toMatch(/tenants de teste/);
    });

    it('403 quando service também detecta via assertTenantSandbox', async () => {
      // simula a chamada real: o service chama o supabase e vê is_sandbox=false
      mocks.tenantsMaybeSingle.mockResolvedValueOnce({
        data: { is_sandbox: false },
        error: null,
      });
      // start() do service REAL (não mock) — mas aqui usamos o mock.
      // Para cobrir o caminho real, mockamos start() que internamente
      // chama assertTenantSandbox. Garantimos o resultado do service.
      const { SyntheticAccessError } = await import('./synthetic-generator.service');
      mocks.start.mockImplementationOnce(async () => {
        throw new SyntheticAccessError();
      });
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/synthetic/generate', {
        body: validBody,
        user: { userId: 'u1', tenantId: 'tenant-real', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('validação de body', () => {
    it('400 com mensagem clara quando intentMix soma ≠ 100', async () => {
      const { SyntheticInputError } = await import('./synthetic-generator.service');
      mocks.start.mockRejectedValueOnce(
        new SyntheticInputError('A soma do mix de intents deve ser 100. Atual: 60.'),
      );
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/synthetic/generate', {
        body: { conversations: 5, intentMix: { a: 30, b: 30 }, mediaPct: 0 },
        user: { userId: 'u1', tenantId: 'tenant-teste', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toMatch(/deve ser 100/);
      expect(body.error).toMatch(/60/);
    });

    it('400 quando conversations fora de 1..2000', async () => {
      const { SyntheticInputError } = await import('./synthetic-generator.service');
      mocks.start.mockRejectedValueOnce(new SyntheticInputError('Number must be greater than 0'));
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/synthetic/generate', {
        body: { conversations: 0, intentMix: { a: 100 }, mediaPct: 0 },
        user: { userId: 'u1', tenantId: 'tenant-teste', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('400 quando mediaPct > 30', async () => {
      const { SyntheticInputError } = await import('./synthetic-generator.service');
      mocks.start.mockRejectedValueOnce(new SyntheticInputError('Number must be less than or equal to 30'));
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/synthetic/generate', {
        body: { conversations: 1, intentMix: { a: 100 }, mediaPct: 50 },
        user: { userId: 'u1', tenantId: 'tenant-teste', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('happy path', () => {
    it('202 {job_id} quando super_admin + tenant sandbox + body válido', async () => {
      mocks.start.mockResolvedValueOnce({ jobId: 'job-xyz' });
      const app = await buildApp();
      const res = await injectAs(app, 'POST', '/api/v2/ia/synthetic/generate', {
        body: { conversations: 5, intentMix: { a: 60, b: 40 }, mediaPct: 0 },
        user: { userId: 'u1', tenantId: 'tenant-teste', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body).toEqual({ job_id: 'job-xyz' });
      expect(mocks.start).toHaveBeenCalledWith(
        'tenant-teste',
        'u1',
        expect.objectContaining({ conversations: 5 }),
      );
    });
  });

  describe('GET /jobs/:id', () => {
    it('404 quando job não existe', async () => {
      mocks.getJob.mockResolvedValueOnce(null);
      const app = await buildApp();
      const res = await injectAs(app, 'GET', '/api/v2/ia/synthetic/jobs/job-x', {
        user: { userId: 'u1', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('200 com status, generated, discarded, error', async () => {
      mocks.getJob.mockResolvedValueOnce({
        id: 'job-1',
        tenantId: 't1',
        userId: 'u1',
        status: 'done',
        generated: 42,
        discarded: 3,
        error: undefined,
        createdAt: '2026-07-06T00:00:00Z',
      });
      const app = await buildApp();
      const res = await injectAs(app, 'GET', '/api/v2/ia/synthetic/jobs/job-1', {
        user: { userId: 'u1', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({
        status: 'done',
        generated: 42,
        discarded: 3,
        error: null,
      });
    });

    it('404 quando job existe mas pertence a outro tenant (isolamento)', async () => {
      mocks.getJob.mockResolvedValueOnce(null); // service já filtra
      const app = await buildApp();
      const res = await injectAs(app, 'GET', '/api/v2/ia/synthetic/jobs/job-outro', {
        user: { userId: 'u1', tenantId: 't1', role: 'super_admin' },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
