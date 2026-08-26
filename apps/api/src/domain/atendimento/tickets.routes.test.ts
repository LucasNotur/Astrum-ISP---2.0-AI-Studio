import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { ticketRoutes } from './tickets.routes';

type AnyChain = { [k: string]: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'update', 'insert', 'order', 'limit']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFrom(terminal: { data: any; error: any }) {
  (supabaseAdmin.from as any).mockReturnValue(makeChain(terminal));
}

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'operator' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any, reply: any) => {
    if (!user) return reply.status(401).send({ code: 'UNAUTHORIZED' });
    request.user = user;
  });
  await app.register(ticketRoutes);
  await app.ready();
  return app;
}

describe('PATCH /api/v2/tickets/:id', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('filtra pelo id do ticket (não só pelo tenant) — evita atualizar todos os tickets do tenant', async () => {
    mockFrom({ data: [{ id: 'tk-1' }], error: null });
    const app = await buildApp();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v2/tickets/f7544310-4a28-4a91-8d0f-ba8939b37c83',
      payload: { status: 'resolved' },
    });

    expect(res.statusCode).toBe(200);
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(chain.eq).toHaveBeenCalledWith('id', 'f7544310-4a28-4a91-8d0f-ba8939b37c83');
  });

  it('mapeia assignedTo (camelCase) pra assigned_to (coluna real)', async () => {
    mockFrom({ data: [{ id: 'tk-1' }], error: null });
    const app = await buildApp();

    await app.inject({
      method: 'PATCH',
      url: '/api/v2/tickets/f7544310-4a28-4a91-8d0f-ba8939b37c83',
      payload: { assignedTo: '8eb68a98-8979-417e-a006-afc8d4c1b4ea' },
    });

    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_to: '8eb68a98-8979-417e-a006-afc8d4c1b4ea' }),
    );
    expect(chain.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ assignedTo: expect.anything() }),
    );
  });
});

describe('POST /api/v2/tickets/:id/snooze', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('grava status snoozed + snoozed_until + snooze_reason + snoozed_by (userId do JWT)', async () => {
    mockFrom({ data: [{ id: 'tk-1' }], error: null });
    const app = await buildApp({ userId: 'op-9', tenantId: 'tenant-1', role: 'operator' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/tickets/f7544310-4a28-4a91-8d0f-ba8939b37c83/snooze',
      payload: { snoozedUntil: '2026-09-01T10:00:00Z', reason: 'Aguardando cliente enviar foto' },
    });

    expect(res.statusCode).toBe(200);
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'snoozed',
        snoozed_until: '2026-09-01T10:00:00Z',
        snooze_reason: 'Aguardando cliente enviar foto',
        snoozed_by: 'op-9',
      }),
    );
    expect(chain.eq).toHaveBeenCalledWith('id', 'f7544310-4a28-4a91-8d0f-ba8939b37c83');
  });

  it('rejeita corpo sem reason', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/tickets/f7544310-4a28-4a91-8d0f-ba8939b37c83/snooze',
      payload: { snoozedUntil: '2026-09-01T10:00:00Z' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('sem auth -> 401', async () => {
    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/tickets/f7544310-4a28-4a91-8d0f-ba8939b37c83/snooze',
      payload: { snoozedUntil: '2026-09-01T10:00:00Z', reason: 'x' },
    });
    expect(res.statusCode).toBe(401);
  });
});
