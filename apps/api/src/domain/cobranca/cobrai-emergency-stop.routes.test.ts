import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../infrastructure/observability/sentry.service', () => ({
  captureWarning: vi.fn(),
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { cobraiEmergencyStopRoutes } from './cobrai-emergency-stop.routes';

type AnyChain = { [k: string]: any };
type Terminal = { data: any; error: any };

function makeChain(terminal: Terminal): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'is', 'order', 'limit', 'insert', 'update']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(terminal);
  chain.single = vi.fn().mockResolvedValue(terminal);
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFromSequence(terminals: Terminal[]) {
  let i = 0;
  (supabaseAdmin.from as any).mockImplementation(() => makeChain(terminals[i++] ?? { data: null, error: null }));
}

async function buildApp(user: any = { userId: 'sa-1', role: 'super_admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { if (user) request.user = user; });
  await app.register(cobraiEmergencyStopRoutes);
  await app.ready();
  return app;
}

const ROLE_ROW = (role: string) => ({ data: { role }, error: null });

describe('cobrai-emergency-stop.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v2/cobranca/emergency-stop', () => {
    it('sem token -> 401', async () => {
      const app = await buildApp(null);
      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/emergency-stop' });
      expect(res.statusCode).toBe(401);
    });

    it('role não super_admin -> 403', async () => {
      mockFromSequence([ROLE_ROW('admin')]);
      const app = await buildApp({ userId: 'u1', role: 'admin' });
      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/emergency-stop' });
      expect(res.statusCode).toBe(403);
    });

    it('super_admin, sem parada ativa -> active:false', async () => {
      mockFromSequence([ROLE_ROW('super_admin'), { data: null, error: null }]);
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/emergency-stop' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ active: false });
      expect(supabaseAdmin.from).toHaveBeenCalledWith('cobranca_emergency_stops');
    });

    it('super_admin, com parada ativa -> active:true + dados', async () => {
      const row = { id: 'stop-1', reason: 'bug no gate', activated_at: '2026-08-25T10:00:00.000Z', activated_by: 'sa-1' };
      mockFromSequence([ROLE_ROW('super_admin'), { data: row, error: null }]);
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/cobranca/emergency-stop' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        active: true,
        reason: row.reason,
        activatedAt: row.activated_at,
        activatedBy: row.activated_by,
      });
    });
  });

  describe('POST /api/v2/cobranca/emergency-stop', () => {
    it('sem token -> 401', async () => {
      const app = await buildApp(null);
      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/emergency-stop', payload: { reason: 'x' } });
      expect(res.statusCode).toBe(401);
    });

    it('role não super_admin -> 403', async () => {
      mockFromSequence([ROLE_ROW('operator')]);
      const app = await buildApp({ userId: 'u1', role: 'operator' });
      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/emergency-stop', payload: { reason: 'x' } });
      expect(res.statusCode).toBe(403);
    });

    it('super_admin ativa o freio -> 201 + grava activated_by do JWT', async () => {
      const inserted = { id: 'stop-1', reason: 'mensagem errada em massa', activated_at: '2026-08-25T10:00:00.000Z', activated_by: 'sa-1' };
      mockFromSequence([ROLE_ROW('super_admin'), { data: null, error: null }, { data: inserted, error: null }]);
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/cobranca/emergency-stop',
        payload: { reason: 'mensagem errada em massa', activatedBy: 'outro-usuario' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ active: true, reason: inserted.reason, activatedAt: inserted.activated_at });
      const insertChain = (supabaseAdmin.from as any).mock.results[2].value;
      // activated_by SEMPRE vem do JWT (authed.userId), nunca do body.
      expect(insertChain.insert).toHaveBeenCalledWith({ reason: inserted.reason, activated_by: 'sa-1' });
    });

    it('já ativo -> 409', async () => {
      const already = { id: 'stop-1', reason: 'já parado', activated_at: '2026-08-25T09:00:00.000Z', activated_by: 'sa-1' };
      mockFromSequence([ROLE_ROW('super_admin'), { data: already, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/emergency-stop', payload: { reason: 'outro motivo' } });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('POST /api/v2/cobranca/emergency-resume', () => {
    it('sem token -> 401', async () => {
      const app = await buildApp(null);
      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/emergency-resume' });
      expect(res.statusCode).toBe(401);
    });

    it('nada ativo -> 409', async () => {
      mockFromSequence([ROLE_ROW('super_admin'), { data: null, error: null }]);
      const app = await buildApp();
      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/emergency-resume' });
      expect(res.statusCode).toBe(409);
    });

    it('super_admin desativa o freio ativo -> 200', async () => {
      const active = { id: 'stop-1', reason: 'x', activated_at: '2026-08-25T09:00:00.000Z', activated_by: 'sa-1' };
      mockFromSequence([ROLE_ROW('super_admin'), { data: active, error: null }, { data: null, error: null }]);
      const app = await buildApp();

      const res = await app.inject({ method: 'POST', url: '/api/v2/cobranca/emergency-resume' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ active: false });
      const updateChain = (supabaseAdmin.from as any).mock.results[2].value;
      expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({ deactivated_by: 'sa-1' }));
      expect(updateChain.eq).toHaveBeenCalledWith('id', active.id);
    });
  });
});
