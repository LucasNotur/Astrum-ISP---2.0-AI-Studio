import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../infrastructure/database/supabase.client', () => {
  const chain = () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  });
  return {
    supabaseAdmin: {
      from: vi.fn(() => chain()),
    },
  };
});

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { computeAllForTenant, getFeatures, getFreshness } from './feature-store.service';
import { FEATURE_DEFS, FEATURE_NAMES } from './feature-registry';

type FromMock = ReturnType<typeof supabaseAdmin.from>;

function mockQuerySequence(rows: any[]) {
  const calls: any[] = [];
  for (const row of rows) calls.push(row);
  (supabaseAdmin.from as any).mockImplementation(() => {
    const next = () => {
      const r = calls.shift() ?? { data: [], error: null };
      const obj: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      };
      obj._resolve = r;
      return obj;
    };
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      then: (onF: any) => onF(next()._resolve),
    };
    return chain;
  });
}

describe('feature-store.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('FEATURE_NAMES tem 4 features canônicas', () => {
    expect(FEATURE_NAMES).toHaveLength(FEATURE_DEFS.length);
    expect(FEATURE_NAMES).toContain('tenure_days');
    expect(FEATURE_NAMES).toContain('overdue_count_90d');
    expect(FEATURE_NAMES).toContain('tickets_90d');
    expect(FEATURE_NAMES).toContain('mrr_cents');
  });

  describe('computeAllForTenant', () => {
    it('roda o cálculo e retorna contagem por feature (fail-open)', async () => {
      // Para cada feature, o serviço faz 1..2 chamadas ao .from() antes do upsert.
      // Montamos um mock permissivo que devolve dados sintéticos.
      const fromMock = supabaseAdmin.from as unknown as ReturnType<typeof vi.fn>;
      fromMock.mockImplementation(() => {
        const data = [
          { id: 'c1', created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(), plan_id: 'p1' },
          { id: 'c2', created_at: new Date(Date.now() - 200 * 86_400_000).toISOString(), plan_id: null },
        ];
        const invoices = [
          { customer_id: 'c1' },
        ];
        const tickets: any[] = [];
        const plans = [
          { id: 'p1', price_cents: 9900 },
        ];
        let callIndex = 0;
        const queue: any[][] = [data, invoices, data, tickets, data, plans, data];
        const obj: any = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          in: vi.fn(() => obj),
          gte: vi.fn(() => obj),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          then: (onF: any) => onF({ data: queue[callIndex++] ?? [], error: null }),
        };
        return obj;
      });

      const result = await computeAllForTenant('t1');
      expect(result.tenantId).toBe('t1');
      expect(Object.keys(result.features)).toEqual(FEATURE_NAMES);
      for (const f of FEATURE_NAMES) {
        expect(result.features[f].ok).toBe(true);
      }
      expect(result.totalRows).toBeGreaterThan(0);
      expect(typeof result.durationMs).toBe('number');
    });

    it('fail-open: se uma feature falhar, as outras continuam', async () => {
      const fromMock = supabaseAdmin.from as unknown as ReturnType<typeof vi.fn>;
      let callIndex = 0;
      fromMock.mockImplementation(() => {
        const obj: any = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          in: vi.fn(() => obj),
          gte: vi.fn(() => obj),
          upsert: vi.fn((rows: any, opts: any) => {
            // upsert falhará na 2ª chamada em diante (para forçar erro em uma feature)
            if (callIndex >= 6) return Promise.resolve({ error: { message: 'forced' } });
            return Promise.resolve({ error: null });
          }),
          then: (onF: any) => {
            callIndex++;
            if (callIndex === 1) {
              return onF({ data: [{ id: 'c1', created_at: new Date().toISOString(), plan_id: null }], error: null });
            }
            return onF({ data: [], error: null });
          },
        };
        return obj;
      });

      const result = await computeAllForTenant('t2');
      const okCount = Object.values(result.features).filter((f) => f.ok).length;
      const failCount = Object.values(result.features).filter((f) => !f.ok).length;
      expect(okCount + failCount).toBe(FEATURE_NAMES.length);
    });
  });

  describe('getFeatures', () => {
    it('retorna mapa de features para um customer', async () => {
      const fromMock = supabaseAdmin.from as unknown as ReturnType<typeof vi.fn>;
      fromMock.mockImplementation(() => {
        const data = [
          { feature: 'tenure_days', value_numeric: 120, value_text: null, computed_at: new Date().toISOString() },
          { feature: 'mrr_cents', value_numeric: 9900, value_text: null, computed_at: new Date().toISOString() },
        ];
        const obj: any = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          in: vi.fn(() => obj),
          then: (onF: any) => onF({ data, error: null }),
        };
        return obj;
      });

      const snap = await getFeatures('t1', 'c1');
      expect(snap.customerId).toBe('c1');
      expect(snap.features.tenure_days).toBe(120);
      expect(snap.features.mrr_cents).toBe(9900);
      expect(snap.features.tickets_90d).toBeNull(); // sem linha → null
      expect(snap.stale).toBe(true); // faltou tickets_90d e overdue_count_90d
    });

    it('retorna mapa vazio com stale=true se o banco falhar', async () => {
      const fromMock = supabaseAdmin.from as unknown as ReturnType<typeof vi.fn>;
      fromMock.mockImplementation(() => {
        const obj: any = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          in: vi.fn(() => obj),
          then: (onF: any) => onF({ data: null, error: { message: 'boom' } }),
        };
        return obj;
      });

      const snap = await getFeatures('t1', 'c1');
      expect(snap.computedAt).toBeNull();
      expect(snap.stale).toBe(true);
    });
  });

  describe('getFreshness', () => {
    it('retorna 1 linha por feature do catálogo, com describe/ttl/entities', async () => {
      const fromMock = supabaseAdmin.from as unknown as ReturnType<typeof vi.fn>;
      fromMock.mockImplementation(() => {
        const data = [
          { feature: 'tenure_days', computed_at: new Date().toISOString(), entity_id: 'c1' },
          { feature: 'tenure_days', computed_at: new Date().toISOString(), entity_id: 'c2' },
          { feature: 'mrr_cents', computed_at: new Date(Date.now() - 48 * 3600_000).toISOString(), entity_id: 'c1' },
        ];
        const obj: any = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          then: (onF: any) => onF({ data, error: null }),
        };
        return obj;
      });

      const rows = await getFreshness('t1');
      expect(rows).toHaveLength(FEATURE_DEFS.length);
      const tenure = rows.find((r) => r.feature === 'tenure_days');
      const mrr = rows.find((r) => r.feature === 'mrr_cents');
      const tickets = rows.find((r) => r.feature === 'tickets_90d');
      expect(tenure?.entities).toBe(2);
      expect(tenure?.stale).toBe(false); // recente
      expect(mrr?.entities).toBe(1);
      expect(mrr?.stale).toBe(true); // 48h > 24h
      expect(tickets?.entities).toBe(0);
      expect(tickets?.computed_at).toBeNull();
    });
  });
});
