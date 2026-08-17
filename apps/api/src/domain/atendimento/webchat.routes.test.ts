import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const h = vi.hoisted(() => ({
  tenantData: null as any,
  openTicket: null as any,
  insertedTicket: null as any,
}));

vi.mock('../../infrastructure/database/supabase.client', () => {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => {
      // A 1ª chamada (config) resolve tenantData; a 2ª (ticket aberto) resolve openTicket.
      // Controlamos por chamada usando um contador simples.
      return Promise.resolve(h.__nextMaybeSingle ?? { data: null, error: null });
    }),
    insert: vi.fn((row: any) => {
      h.insertedTicket = row;
      return Promise.resolve({ data: null, error: null });
    }),
  };
  const supabaseAdmin = { from: vi.fn(() => builder) };
  return { supabaseAdmin, default: supabaseAdmin };
});

vi.mock('../../infrastructure/queue/bullmq.client', () => ({
  enqueueMessage: vi.fn().mockResolvedValue({ id: 'job-1' }),
}));

vi.mock('../../infrastructure/cache/redis.client', () => ({
  redis: { lpop: vi.fn() },
}));

import { webchatRoutes } from './webchat.routes';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { enqueueMessage } from '../../infrastructure/queue/bullmq.client';
import { redis } from '../../infrastructure/cache/redis.client';

async function buildApp() {
  const app = Fastify();
  await app.register(webchatRoutes);
  await app.ready();
  return app;
}

// Helper: injeta o valor que o PRÓXIMO .maybeSingle() vai resolver.
function nextMaybeSingle(value: any) {
  (h as any).__nextMaybeSingle = value;
}

describe('webchatRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (h as any).__nextMaybeSingle = { data: null, error: null };
    h.insertedTicket = null;
  });

  describe('GET /api/v2/webchat/config', () => {
    it('sem tenantId -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/webchat/config' });
      expect(res.statusCode).toBe(400);
    });

    it('tenant inexistente -> 404', async () => {
      nextMaybeSingle({ data: null, error: null });
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/webchat/config?tenantId=t-1' });
      expect(res.statusCode).toBe(404);
    });

    it('tenant existente -> devolve config com defaults', async () => {
      nextMaybeSingle({ data: { extra: {} }, error: null });
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/webchat/config?tenantId=t-1' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ primary_color: '#00C896', logo_url: '', agent_name: 'Agente' });
    });
  });

  describe('POST /api/v2/webchat/message', () => {
    it('body inválido -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'POST', url: '/api/v2/webchat/message', payload: { tenantId: 't-1' } });
      expect(res.statusCode).toBe(400);
    });

    it('sem ticket aberto -> cria um novo + enfileira + long-poll sem resposta -> timeout', async () => {
      nextMaybeSingle({ data: null, error: null }); // nenhum ticket aberto
      (redis.lpop as any).mockResolvedValue(null);

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/webchat/message',
        payload: { tenantId: 't-1', sessionId: 's-1', text: 'oi' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ timeout: true });
      expect(h.insertedTicket).toMatchObject({
        tenant_id: 't-1',
        customer_id: 'webchat_s-1',
        status: 'open',
      });
      expect(enqueueMessage).toHaveBeenCalledWith('t-1', expect.objectContaining({
        tenantId: 't-1',
        from: 'webchat_s-1',
        text: 'oi',
        source: 'webchat',
      }));
    }, 20000);

    it('ticket já aberto -> não cria outro', async () => {
      nextMaybeSingle({ data: { id: 'ticket-existing' }, error: null });
      (redis.lpop as any).mockResolvedValue('Resposta do bot');

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/webchat/message',
        payload: { tenantId: 't-1', sessionId: 's-1', text: 'oi' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ reply: 'Resposta do bot' });
      expect(h.insertedTicket).toBeNull();
      expect(supabaseAdmin.from).toHaveBeenCalledWith('tickets');
    });
  });
});
