import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

/**
 * Cobre o "sync" do App do Técnico (F0-01): a agenda (puxar OS do Supabase) e a
 * transição de OS (empurrar atualização de status). A tela `TechnicianAppPage`
 * consome estas rotas via `src/lib/fieldOps.ts` — antes o app apontava para o
 * endpoint morto `/api/service-orders/sync` (404). Aqui garantimos que a rota v2
 * real autentica, respeita o tenant e devolve o shape esperado.
 */

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

// A transição delega ao serviço de ciclo de vida — mockado para isolar a rota.
vi.mock('./os-lifecycle.service', () => ({
  applyTransition: vi.fn(),
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { applyTransition } from './os-lifecycle.service';
import { fieldOpsRoutes } from './field-ops.routes';

type AnyChain = { [k: string]: any };
type Terminal = { data: any; error: any };

function makeChain(terminal: Terminal): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'is', 'not', 'order', 'limit', 'insert', 'update']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(terminal);
  chain.single = vi.fn().mockResolvedValue(terminal);
  // A query da agenda é aguardada direto (sem maybeSingle) → precisa ser thenable.
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFromSequence(terminals: Terminal[]) {
  let i = 0;
  (supabaseAdmin.from as any).mockImplementation(() => makeChain(terminals[i++] ?? { data: null, error: null }));
}

const DEFAULT_USER = { userId: 'user-1', tenantId: 'tenant-1', role: 'operator' as const };

async function buildApp(user: any = DEFAULT_USER) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { if (user) request.user = user; });
  await app.register(fieldOpsRoutes);
  await app.ready();
  return app;
}

describe('field-ops.routes — sync do App do Técnico', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v2/field/agenda (puxar OS)', () => {
    it('sem token -> 401', async () => {
      const app = await buildApp(null);
      const res = await app.inject({ method: 'GET', url: '/api/v2/field/agenda' });
      expect(res.statusCode).toBe(401);
    });

    it('usuário sem service_orders:read (viewer tem; usamos role inexistente) -> 403', async () => {
      // Um role sem permissão de service_orders:read é barrado pelo RBAC.
      const app = await buildApp({ userId: 'u9', tenantId: 'tenant-1', role: 'sem_papel' });
      const res = await app.inject({ method: 'GET', url: '/api/v2/field/agenda' });
      expect(res.statusCode).toBe(403);
    });

    it('usuário não é técnico -> 404 NOT_A_TECHNICIAN', async () => {
      mockFromSequence([{ data: null, error: null }]); // technicians.maybeSingle -> nada
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/field/agenda' });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('NOT_A_TECHNICIAN');
    });

    it('técnico logado -> 200 com as OS do tenant, escopadas por tenant + assigned_to', async () => {
      const orders = [
        { id: 'os-1', customer_name: 'Cliente A', address: 'Rua 1', latitude: -23.5, longitude: -46.6, status: 'agendada', type: 'instalacao', description: 'Fibra', scheduled_for: '2026-08-31T13:00:00.000Z', time_window_start: null, time_window_end: null, premise_id: null },
        { id: 'os-2', customer_name: 'Cliente B', address: 'Rua 2', latitude: null, longitude: null, status: 'em_atendimento', type: 'reparo', description: null, scheduled_for: '2026-08-31T15:00:00.000Z', time_window_start: null, time_window_end: null, premise_id: null },
      ];
      mockFromSequence([
        { data: { id: 'tech-1' }, error: null }, // technicians
        { data: orders, error: null },           // service_orders
      ]);
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/field/agenda' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.technician_id).toBe('tech-1');
      expect(body.orders).toHaveLength(2);
      expect(body.orders[0].id).toBe('os-1');

      // Isolamento multi-tenant: technicians filtrado por tenant + user.
      expect(supabaseAdmin.from).toHaveBeenNthCalledWith(1, 'technicians');
      const techChain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(techChain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(techChain.eq).toHaveBeenCalledWith('user_id', 'user-1');

      // service_orders escopado por tenant + técnico + status não-terminal.
      expect(supabaseAdmin.from).toHaveBeenNthCalledWith(2, 'service_orders');
      const osChain = (supabaseAdmin.from as any).mock.results[1].value;
      expect(osChain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(osChain.eq).toHaveBeenCalledWith('assigned_to', 'tech-1');
      expect(osChain.not).toHaveBeenCalledWith('status', 'in', '(concluido,cancelado,completed,cancelled)');
    });

    it('erro do Supabase na agenda -> 500 AGENDA_ERROR', async () => {
      mockFromSequence([
        { data: { id: 'tech-1' }, error: null },
        { data: null, error: { message: 'db down' } },
      ]);
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/field/agenda' });
      expect(res.statusCode).toBe(500);
      expect(res.json().code).toBe('AGENDA_ERROR');
    });
  });

  describe('POST /api/v2/field/os/:id/transition (empurrar atualização)', () => {
    it('sem token -> 401', async () => {
      const app = await buildApp(null);
      const res = await app.inject({ method: 'POST', url: '/api/v2/field/os/os-1/transition', payload: { event: 'iniciada' } });
      expect(res.statusCode).toBe(401);
    });

    it('usuário não é técnico -> 404 NOT_A_TECHNICIAN', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();
      const res = await app.inject({ method: 'POST', url: '/api/v2/field/os/os-1/transition', payload: { event: 'iniciada' } });
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('NOT_A_TECHNICIAN');
    });

    it('técnico aplica transição válida -> 200 com from/to/status', async () => {
      mockFromSequence([{ data: { id: 'tech-1' }, error: null }]);
      (applyTransition as any).mockResolvedValue({
        ok: true, fromPhase: 'agendada', toPhase: 'em_atendimento', status: 'em_atendimento',
      });
      const app = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/field/os/os-1/transition',
        payload: { event: 'iniciada', lat: -23.5, lng: -46.6 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true, from: 'agendada', to: 'em_atendimento', status: 'em_atendimento' });
      // A transição foi aplicada com o tenant + técnico corretos.
      expect(applyTransition).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', serviceOrderId: 'os-1', technicianId: 'tech-1', event: 'iniciada' }),
        expect.anything(),
      );
    });

    it('gate de conclusão bloqueia -> 422 COMPLETION_BLOCKED', async () => {
      mockFromSequence([{ data: { id: 'tech-1' }, error: null }]);
      (applyTransition as any).mockResolvedValue({
        ok: false, error: 'faltam itens', missing: ['checklist'], fromPhase: 'em_atendimento',
      });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/field/os/os-1/transition',
        payload: { event: 'concluida' },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe('COMPLETION_BLOCKED');
      expect(res.json().missing).toEqual(['checklist']);
    });

    it('transição inválida/terminal -> 409 INVALID_TRANSITION', async () => {
      mockFromSequence([{ data: { id: 'tech-1' }, error: null }]);
      (applyTransition as any).mockResolvedValue({
        ok: false, error: 'já concluída', fromPhase: 'concluido',
      });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/field/os/os-1/transition',
        payload: { event: 'iniciada' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('INVALID_TRANSITION');
    });
  });
});
