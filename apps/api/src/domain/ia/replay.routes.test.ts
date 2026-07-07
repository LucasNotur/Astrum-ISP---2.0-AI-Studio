import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── vi.hoisted: tudo que as factories de vi.mock precisam ───────────────────
const mocks = vi.hoisted(() => {
  const enqueueReplayMock = vi.fn();
  const listReplayRunsMock = vi.fn();
  const getReplayRunDetailMock = vi.fn();
  const queueAddMock = vi.fn(async () => ({ id: 'mock-job' }));
  return {
    enqueueReplayMock,
    listReplayRunsMock,
    getReplayRunDetailMock,
    queueAddMock,
  };
});

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock do RBAC: ignora permissão (controlamos o user manualmente).
vi.mock('../../infrastructure/auth/rbac.middleware', () => ({
  requirePermission: () => async () => undefined,
}));

// NÃO mockamos os validadores — queremos que o Zod faça o trabalho real.
// A validação é parte do comportamento que estamos testando.

// Mock do service.
vi.mock('../../domain/atendimento/replay.service', () => ({
  enqueueReplay: (...args: any[]) => mocks.enqueueReplayMock(...args),
  listReplayRuns: (...args: any[]) => mocks.listReplayRunsMock(...args),
  getReplayRunDetail: (...args: any[]) => mocks.getReplayRunDetailMock(...args),
}));

// Mock do redis.client para FORÇAR isMockRedis=false dentro da route — assim a
// rota usa `new Queue(...)` (mockado abaixo) em vez do branch mock local.
vi.mock('../../infrastructure/cache/redis.client', () => ({
  connection: { options: { host: 'mock-host' } },
  default: { options: { host: 'mock-host' } },
}));

// Mock do BullMQ Queue — captura o `add` (sem subir Redis).
vi.mock('bullmq', async () => {
  const actual = await vi.importActual<any>('bullmq');
  return {
    ...actual,
    Queue: class {
      add = mocks.queueAddMock;
      on = vi.fn();
      close = vi.fn(async () => {});
    },
  };
});

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = { userId: 'u1', tenantId: 'tenant-1', role: 'admin' };
  });
  const { replayRoutes } = await import('./replay.routes');
  await app.register(replayRoutes);
  return app;
}

import Fastify from 'fastify';

describe('replay.routes (IA-46)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v2/ia/replay', () => {
    it('valida body e devolve 202 {run_id} + enfileira', async () => {
      mocks.enqueueReplayMock.mockResolvedValueOnce('run-abc');
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/ia/replay',
        headers: { 'content-type': 'application/json' },
        payload: {
          from: '2026-07-01T00:00:00.000Z',
          to: '2026-07-02T00:00:00.000Z',
          sample: 50,
        },
      });
      expect(res.statusCode).toBe(202);
      expect(JSON.parse(res.body)).toEqual({ run_id: 'run-abc' });
      expect(mocks.enqueueReplayMock).toHaveBeenCalledWith('tenant-1', {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-02T00:00:00.000Z',
        sample: 50,
      });
      expect(mocks.queueAddMock).toHaveBeenCalledWith('replay.run', {
        runId: 'run-abc',
        tenantId: 'tenant-1',
      });
    });

    it('rejeita sample fora do range 10..500 (Zod)', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/ia/replay',
        headers: { 'content-type': 'application/json' },
        payload: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-02T00:00:00.000Z', sample: 5 },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).code).toBe('VALIDATION_ERROR');
    });

    it('rejeita from >= to (validação de domínio)', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/ia/replay',
        headers: { 'content-type': 'application/json' },
        payload: {
          from: '2026-07-02T00:00:00.000Z',
          to: '2026-07-01T00:00:00.000Z',
          sample: 50,
        },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).code).toBe('INVALID_RANGE');
    });
  });

  describe('GET /api/v2/ia/replay/runs', () => {
    it('lista as runs do tenant', async () => {
      mocks.listReplayRunsMock.mockResolvedValueOnce([
        { id: 'r1', status: 'done', total: 50, pass_rate: 0.92, created_at: '2026-07-06T10:00:00Z' },
        { id: 'r2', status: 'running', total: null, pass_rate: null, created_at: '2026-07-06T09:00:00Z' },
      ]);
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/ia/replay/runs' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual([
        { id: 'r1', status: 'done', total: 50, pass_rate: 0.92, created_at: '2026-07-06T10:00:00Z' },
        { id: 'r2', status: 'running', total: null, pass_rate: null, created_at: '2026-07-06T09:00:00Z' },
      ]);
      expect(mocks.listReplayRunsMock).toHaveBeenCalledWith('tenant-1');
    });
  });

  describe('GET /api/v2/ia/replay/runs/:id', () => {
    it('devolve detalhe paginado com filtro de verdict (page/pageSize coerced to number)', async () => {
      mocks.getReplayRunDetailMock.mockResolvedValueOnce({
        status: 'done',
        total: 50,
        equivalent: 46,
        pass_rate: 0.92,
        items: [
          { id: 'i1', run_id: 'r1', conversation_id: 'cv1', user_message: 'oi', original_response: 'olá', candidate_response: 'oi!', verdict: 'divergente', judge_rationale: 'tom diferente' },
        ],
        page: 1,
        pageSize: 50,
      });
      const app = await buildApp();
      // Zod 4 .uuid() valida UUID v4 estrito (version digit = 4, variant = 8|9|a|b).
      // O UUID abaixo tem versão 4 e variant 8 — passa na validação.
      const res = await app.inject({
        method: 'GET',
        url: '/api/v2/ia/replay/runs/11111111-1111-4111-8111-111111111111?verdict=divergente&page=1&pageSize=50',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('done');
      expect(body.pass_rate).toBe(0.92);
      expect(body.items).toHaveLength(1);
      expect(mocks.getReplayRunDetailMock).toHaveBeenCalledWith(
        'tenant-1',
        '11111111-1111-4111-8111-111111111111',
        { verdict: 'divergente', page: 1, pageSize: 50 },
      );
    });

    it('devolve 404 quando run não existe para o tenant', async () => {
      mocks.getReplayRunDetailMock.mockResolvedValueOnce(null);
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v2/ia/replay/runs/22222222-2222-4222-8222-222222222222',
      });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).code).toBe('RUN_NOT_FOUND');
    });

    it('rejeita id não-UUID', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v2/ia/replay/runs/nao-eh-uuid',
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).code).toBe('INVALID_PARAMS');
    });
  });
});
