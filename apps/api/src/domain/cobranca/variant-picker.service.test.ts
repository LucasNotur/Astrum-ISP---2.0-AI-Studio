import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../infrastructure/database/supabase.client', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import {
  listActiveVariants,
  listAllVariantsForCampaign,
  tryPickVariant,
  recordVariantSend,
  setVariantStatus,
  createVariant,
  buildMessageFromVariant,
  getVariantStatsByCampaign,
  isBanditEnabled,
} from './variant-picker.service';

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type AnyChain = {
  [k: string]: any;
  then?: any;
};

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
  (supabaseAdmin.from as any).mockImplementation(() => makeChain(terminals[i++] ?? { data: [], error: null }));
}

describe('variant-picker.service (IA-26)', () => {
  const ORIGINAL_ENV = process.env.BANDIT_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BANDIT_ENABLED = 'false';
  });

  afterEach(() => {
    process.env.BANDIT_ENABLED = ORIGINAL_ENV;
  });

  describe('isBanditEnabled', () => {
    it('lê BANDIT_ENABLED do env (default false)', () => {
      expect(isBanditEnabled()).toBe(false);
    });

    it('liga quando env=true', () => {
      process.env.BANDIT_ENABLED = 'true';
      expect(isBanditEnabled()).toBe(true);
    });

    it('tolera caixa/espacos', () => {
      process.env.BANDIT_ENABLED = '  TRUE  ';
      expect(isBanditEnabled()).toBe(true);
    });
  });

  describe('listActiveVariants', () => {
    it('filtra por tenant, campaign_key e status=active', async () => {
      mockFromSequence([
        {
          data: [
            {
              id: 'v1',
              tenant_id: 't1',
              campaign_key: 'cobranca_d1',
              variant_key: 'A',
              template: 'Oi {{name}}',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
          ],
          error: null,
        },
      ]);
      const result = await listActiveVariants('t1', 'cobranca_d1');
      expect(result).toHaveLength(1);
      expect(result[0]?.variantKey).toBe('A');
      expect(result[0]?.template).toBe('Oi {{name}}');
    });

    it('lança se o Supabase retornar error', async () => {
      mockFromSequence([{ data: null, error: { message: 'permission denied' } }]);
      await expect(listActiveVariants('t1', 'k')).rejects.toThrow(/permission denied/);
    });
  });

  describe('tryPickVariant', () => {
    it('retorna null quando há menos de 2 variantes ativas', async () => {
      mockFromSequence([
        {
          data: [
            {
              id: 'v1',
              tenant_id: 't1',
              campaign_key: 'c',
              variant_key: 'A',
              template: 't',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
          ],
          error: null,
        },
      ]);
      const picked = await tryPickVariant('t1', 'c', mulberry32(1));
      expect(picked).toBeNull();
    });

    it('retorna a variante sorteada com template e variantKey', async () => {
      mockFromSequence([
        {
          data: [
            {
              id: 'v1',
              tenant_id: 't1',
              campaign_key: 'c',
              variant_key: 'A',
              template: 'msg A',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
            {
              id: 'v2',
              tenant_id: 't1',
              campaign_key: 'c',
              variant_key: 'B',
              template: 'msg B',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
          ],
          error: null,
        },
      ]);
      const picked = await tryPickVariant('t1', 'c', mulberry32(7));
      expect(picked).not.toBeNull();
      expect(['msg A', 'msg B']).toContain(picked!.template);
      expect(['A', 'B']).toContain(picked!.variantKey);
      expect(picked!.id).toMatch(/^v[12]$/);
    });

    it('é determinístico com mesmo seed', async () => {
      const data = [
        {
          id: 'v1',
          tenant_id: 't1',
          campaign_key: 'c',
          variant_key: 'A',
          template: 'msg A',
          alpha: 1,
          beta: 1,
          status: 'active',
        },
        {
          id: 'v2',
          tenant_id: 't1',
          campaign_key: 'c',
          variant_key: 'B',
          template: 'msg B',
          alpha: 1,
          beta: 1,
          status: 'active',
        },
      ];
      // Reset mock e rode duas vezes
      (supabaseAdmin.from as any).mockReset();
      mockFromSequence([{ data, error: null }]);
      const a = await tryPickVariant('t1', 'c', mulberry32(99));

      (supabaseAdmin.from as any).mockReset();
      mockFromSequence([{ data, error: null }]);
      const b = await tryPickVariant('t1', 'c', mulberry32(99));

      expect(a?.id).toBe(b?.id);
    });
  });

  describe('recordVariantSend', () => {
    it('insere uma linha em variant_sends', async () => {
      const chain = makeChain({ data: null, error: null });
      (supabaseAdmin.from as any).mockReturnValue(chain);
      await recordVariantSend('t1', 'v1', 'inv-1');
      expect(supabaseAdmin.from).toHaveBeenCalledWith('variant_sends');
      expect(chain.insert).toHaveBeenCalledWith({
        tenant_id: 't1',
        variant_id: 'v1',
        invoice_id: 'inv-1',
      });
    });

    it('lança em caso de erro do Supabase', async () => {
      (supabaseAdmin.from as any).mockReturnValue(
        makeChain({ data: null, error: { message: 'insert failed' } }),
      );
      await expect(recordVariantSend('t1', 'v1', 'inv-1')).rejects.toThrow(/insert failed/);
    });
  });

  describe('setVariantStatus', () => {
    it('faz update com eq tenant + eq id', async () => {
      const chain = makeChain({ data: null, error: null });
      (supabaseAdmin.from as any).mockReturnValue(chain);
      await setVariantStatus('t1', 'v1', 'paused');
      expect(supabaseAdmin.from).toHaveBeenCalledWith('campaign_variants');
      expect(chain.update).toHaveBeenCalledWith({ status: 'paused' });
    });
  });

  describe('createVariant', () => {
    it('insere e devolve a variante criada', async () => {
      const inserted = {
        id: 'v-new',
        tenant_id: 't1',
        campaign_key: 'c',
        variant_key: 'C',
        template: 'msg C',
        alpha: 1,
        beta: 1,
        status: 'active',
      };
      const chain = makeChain({ data: inserted, error: null });
      (supabaseAdmin.from as any).mockReturnValue(chain);
      const v = await createVariant('t1', 'c', 'C', 'msg C');
      expect(v.id).toBe('v-new');
      expect(v.variantKey).toBe('C');
      expect(v.alpha).toBe(1);
      expect(v.beta).toBe(1);
    });
  });

  describe('buildMessageFromVariant', () => {
    it('interpola quando vars é fornecido', () => {
      expect(
        buildMessageFromVariant('Oi {{name}}, valor {{amount}}', {
          name: 'Lucas',
          amount: 100,
        }),
      ).toBe('Oi Lucas, valor 100');
    });

    it('devolve o template cru quando vars é undefined', () => {
      expect(buildMessageFromVariant('Oi {{name}}', undefined)).toBe('Oi {{name}}');
    });
  });

  describe('getVariantStatsByCampaign', () => {
    it('retorna [] quando não há variantes', async () => {
      mockFromSequence([{ data: [], error: null }]);
      const stats = await getVariantStatsByCampaign('t1', 'c');
      expect(stats).toEqual([]);
    });

    it('agrega sent/paid/expired e calcula IC 95%', async () => {
      // 1) listAllVariantsForCampaign → 2 variantes
      // 2) select variant_sends → 4 linhas (1 paid, 1 expired, 2 pending=null)
      mockFromSequence([
        {
          data: [
            {
              id: 'v1',
              tenant_id: 't1',
              campaign_key: 'c',
              variant_key: 'A',
              template: 'tA',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
            {
              id: 'v2',
              tenant_id: 't1',
              campaign_key: 'c',
              variant_key: 'B',
              template: 'tB',
              alpha: 1,
              beta: 1,
              status: 'paused',
            },
          ],
          error: null,
        },
        {
          data: [
            { variant_id: 'v1', outcome: 'paid' },
            { variant_id: 'v1', outcome: 'expired' },
            { variant_id: 'v1', outcome: null },
            { variant_id: 'v2', outcome: 'paid' },
            { variant_id: 'v2', outcome: 'paid' },
          ],
          error: null,
        },
      ]);

      const stats = await getVariantStatsByCampaign('t1', 'c');
      expect(stats).toHaveLength(2);

      const s1 = stats.find((s) => s.variantId === 'v1')!;
      expect(s1.sent).toBe(3);
      expect(s1.paid).toBe(1);
      expect(s1.expired).toBe(1);
      expect(s1.conversionRate).toBeCloseTo(0.5, 5);
      // decided=2, p=0.5, se=sqrt(0.25/2)=0.3536, IC = 0.5 ± 0.6931
      expect(s1.ci95Low).toBeCloseTo(0, 5);
      expect(s1.ci95High).toBeCloseTo(1, 5);

      const s2 = stats.find((s) => s.variantId === 'v2')!;
      expect(s2.sent).toBe(2);
      expect(s2.paid).toBe(2);
      expect(s2.expired).toBe(0);
      expect(s2.conversionRate).toBe(1);
      // decided=2, p=1, se=0, IC = [1, 1]
      expect(s2.ci95Low).toBe(1);
      expect(s2.ci95High).toBe(1);
    });

    it('decided=0 → conversionRate=0 e IC=[0,0]', async () => {
      mockFromSequence([
        {
          data: [
            {
              id: 'v1',
              tenant_id: 't1',
              campaign_key: 'c',
              variant_key: 'A',
              template: 'tA',
              alpha: 1,
              beta: 1,
              status: 'active',
            },
          ],
          error: null,
        },
        { data: [{ variant_id: 'v1', outcome: null }], error: null },
      ]);
      const stats = await getVariantStatsByCampaign('t1', 'c');
      expect(stats[0]?.conversionRate).toBe(0);
      expect(stats[0]?.ci95Low).toBe(0);
      expect(stats[0]?.ci95High).toBe(0);
    });
  });

  describe('listAllVariantsForCampaign', () => {
    it('não filtra por status', async () => {
      mockFromSequence([
        {
          data: [
            {
              id: 'v1',
              tenant_id: 't1',
              campaign_key: 'c',
              variant_key: 'A',
              template: 'tA',
              alpha: 1,
              beta: 1,
              status: 'paused',
            },
          ],
          error: null,
        },
      ]);
      const vs = await listAllVariantsForCampaign('t1', 'c');
      expect(vs[0]?.status).toBe('paused');
    });
  });
});
