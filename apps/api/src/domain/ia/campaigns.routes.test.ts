import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/auth/rbac.middleware', () => ({
  requirePermission: () => async () => undefined,
}));

vi.mock('../../infrastructure/database/supabase.client', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { campaignsRoutes } from './campaigns.routes';

type AnyChain = { [k: string]: any; then?: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of [
    'select',
    'eq',
    'in',
    'gte',
    'insert',
    'update',
    'single',
    'order',
    'limit',
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  Object.defineProperty(chain, 'then', {
    get() {
      return (onF: any) => onF(terminal);
    },
  });
  return chain;
}

function mockFromSequence(terminals: Array<{ data: any; error: any }>) {
  let i = 0;
  (supabaseAdmin.from as any).mockImplementation(() =>
    makeChain(terminals[i++] ?? { data: [], error: null }),
  );
}

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = { userId: 'u1', tenantId: 'tenant-1', role: 'admin' };
  });
  await app.register(campaignsRoutes);
  return app;
}

describe('campaigns.routes (IA-26)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v2/ia/campaigns', () => {
    it('retorna lista vazia quando o tenant não tem variantes', async () => {
      mockFromSequence([{ data: [], error: null }]);
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/ia/campaigns' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({ campaigns: [] });
    });

    it('agrega variantes e marca campanha como "explorando" quando há < 2 ativos com envios', async () => {
      // Sequência esperada de chamadas `from()`:
      //  1) distinct campaign_keys
      //  2) listAllVariantsForCampaign
      //  3) getVariantStatsByCampaign → listAllVariantsForCampaign
      //  4) getVariantStatsByCampaign → variant_sends query
      mockFromSequence([
        {
          data: [
            { campaign_key: 'cobranca_d1' },
            { campaign_key: 'cobranca_d1' },
            { campaign_key: 'cobranca_d1' },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'v1',
              tenant_id: 'tenant-1',
              campaign_key: 'cobranca_d1',
              variant_key: 'A',
              template: 'msg A {{customerName}}',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
            {
              id: 'v2',
              tenant_id: 'tenant-1',
              campaign_key: 'cobranca_d1',
              variant_key: 'B',
              template: 'msg B {{customerName}}',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'v1',
              tenant_id: 'tenant-1',
              campaign_key: 'cobranca_d1',
              variant_key: 'A',
              template: 'msg A {{customerName}}',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
            {
              id: 'v2',
              tenant_id: 'tenant-1',
              campaign_key: 'cobranca_d1',
              variant_key: 'B',
              template: 'msg B {{customerName}}',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
          ],
          error: null,
        },
        {
          data: [
            { variant_id: 'v1', outcome: 'paid' },
            { variant_id: 'v2', outcome: 'expired' },
          ],
          error: null,
        },
      ]);

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/ia/campaigns' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.campaigns).toHaveLength(1);
      const c = body.campaigns[0];
      expect(c.campaignKey).toBe('cobranca_d1');
      // v1=1.0 vs v2=0.0 → gap=1.0 > 0.1 → "convergiu"
      expect(c.status).toBe('convergiu');
      expect(c.variants).toHaveLength(2);
      expect(c.variants[0].variantKey).toBe('A');
      expect(c.variants[0].conversionRate).toBe(1);
      expect(c.variants[1].conversionRate).toBe(0);
    });

    it('marca como "convergiu" quando a diferença de conversão entre variantes ativas excede 0.1', async () => {
      mockFromSequence([
        { data: [{ campaign_key: 'k' }, { campaign_key: 'k' }], error: null },
        {
          data: [
            {
              id: 'v1',
              tenant_id: 'tenant-1',
              campaign_key: 'k',
              variant_key: 'A',
              template: 'tA',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
            {
              id: 'v2',
              tenant_id: 'tenant-1',
              campaign_key: 'k',
              variant_key: 'B',
              template: 'tB',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'v1',
              tenant_id: 'tenant-1',
              campaign_key: 'k',
              variant_key: 'A',
              template: 'tA',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
            {
              id: 'v2',
              tenant_id: 'tenant-1',
              campaign_key: 'k',
              variant_key: 'B',
              template: 'tB',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
          ],
          error: null,
        },
        {
          data: [
            { variant_id: 'v1', outcome: 'paid' },
            { variant_id: 'v1', outcome: 'paid' },
            { variant_id: 'v2', outcome: 'expired' },
            { variant_id: 'v2', outcome: 'expired' },
          ],
          error: null,
        },
      ]);

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/ia/campaigns' });
      const body = JSON.parse(res.body);
      expect(body.campaigns[0].status).toBe('convergiu');
    });

    it('retorna 500 quando a query de campaign_keys falha', async () => {
      mockFromSequence([{ data: null, error: { message: 'db down' } }]);
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/ia/campaigns' });
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.code).toBe('DB_ERROR');
    });
  });

  describe('POST /api/v2/ia/campaigns/variants', () => {
    it('cria variante e devolve o objeto', async () => {
      mockFromSequence([
        {
          data: {
            id: 'v-new',
            tenant_id: 'tenant-1',
            campaign_key: 'k',
            variant_key: 'C',
            template: 'tC',
            alpha: 1,
            beta: 1,
            status: 'active',
          },
          error: null,
        },
      ]);

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/ia/campaigns/variants',
        payload: { campaign_key: 'k', variant_key: 'C', template: 'tC' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.variant.id).toBe('v-new');
      expect(body.variant.variantKey).toBe('C');
    });

    it('rejeita body sem campos obrigatórios', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/ia/campaigns/variants',
        payload: { campaign_key: 'k' },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.code).toBe('BAD_REQUEST');
    });

    it('devolve 409 em conflito (duplicate key)', async () => {
      mockFromSequence([
        {
          data: null,
          error: { message: 'duplicate key value violates unique constraint' },
        },
      ]);
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v2/ia/campaigns/variants',
        payload: { campaign_key: 'k', variant_key: 'A', template: 'tA' },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('PATCH /api/v2/ia/campaigns/variants/:id', () => {
    it('pausa variante com status="paused"', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v2/ia/campaigns/variants/v1',
        payload: { status: 'paused' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toEqual({ ok: true, id: 'v1', status: 'paused' });
    });

    it('reativa variante com status="active"', async () => {
      mockFromSequence([{ data: null, error: null }]);
      const app = await buildApp();
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v2/ia/campaigns/variants/v1',
        payload: { status: 'active' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('active');
    });

    it('rejeita status inválido', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v2/ia/campaigns/variants/v1',
        payload: { status: 'banana' },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
