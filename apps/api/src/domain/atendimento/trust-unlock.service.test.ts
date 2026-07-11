import { describe, it, expect, vi } from 'vitest';
import {
  checkTrustUnlockEligibility,
  executeTrustUnlock,
  type TrustUnlockDb,
} from './trust-unlock.service';

function makeDb(opts: {
  policy?: Record<string, unknown> | null;
  countThisYear?: number;
  insertError?: boolean;
}): TrustUnlockDb {
  const { policy = null, countThisYear = 0, insertError = false } = opts;

  return {
    from: (table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: table === 'trust_unlock_policies' ? policy : null }),
          gte: vi.fn().mockReturnValue({ count: countThisYear }),
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({ count: countThisYear }),
          }),
        }),
        count: 'exact',
        head: true,
      }),
      insert: vi.fn().mockResolvedValue({ error: insertError ? { message: 'db error' } : null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    }),
  } as unknown as TrustUnlockDb;
}

// helpers para simular a chain real
function makeFullDb(opts: {
  policy?: Record<string, unknown> | null;
  countThisYear?: number;
  insertError?: boolean;
}): TrustUnlockDb {
  const { policy = null, countThisYear = 0, insertError = false } = opts;

  const countResult = { count: countThisYear };

  const fromMock = vi.fn((table: string) => {
    if (table === 'trust_unlock_policies') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: policy }) }) }),
      };
    }
    if (table === 'trust_unlocks') {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ gte: vi.fn().mockResolvedValue(countResult) }) }) }),
        insert: vi.fn().mockResolvedValue({ error: insertError ? { message: 'err' } : null }),
      };
    }
    if (table === 'customers') {
      return {
        update: () => ({ eq: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
      };
    }
    return {};
  });

  return { from: fromMock } as unknown as TrustUnlockDb;
}

describe('checkTrustUnlockEligibility (P1-01)', () => {
  it('usa default policy quando tenant não tem cadastro', async () => {
    const db = makeFullDb({ policy: null, countThisYear: 0 });
    const result = await checkTrustUnlockEligibility(db, 't1', 'c1', 5000);
    expect(result.eligible).toBe(true);
    expect(result.policy.max_times_per_year).toBe(2);
  });

  it('recusa quando feature_disabled', async () => {
    const db = makeFullDb({ policy: { max_times_per_year: 2, max_debt_cents: 20000, enabled: false } });
    const result = await checkTrustUnlockEligibility(db, 't1', 'c1', 5000);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('feature_disabled');
  });

  it('recusa quando dívida excede o limite', async () => {
    const db = makeFullDb({ policy: { max_times_per_year: 2, max_debt_cents: 10000, enabled: true } });
    const result = await checkTrustUnlockEligibility(db, 't1', 'c1', 15000);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('debt_exceeds_limit');
  });

  it('recusa quando limite anual foi atingido', async () => {
    const db = makeFullDb({
      policy: { max_times_per_year: 2, max_debt_cents: 20000, enabled: true },
      countThisYear: 2,
    });
    const result = await checkTrustUnlockEligibility(db, 't1', 'c1', 5000);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('limit_reached');
    expect(result.timesThisYear).toBe(2);
  });

  it('elegível quando ainda há usos disponíveis', async () => {
    const db = makeFullDb({
      policy: { max_times_per_year: 3, max_debt_cents: 30000, enabled: true },
      countThisYear: 1,
    });
    const result = await checkTrustUnlockEligibility(db, 't1', 'c1', 5000);
    expect(result.eligible).toBe(true);
    expect(result.timesThisYear).toBe(1);
  });
});

describe('executeTrustUnlock (P1-01)', () => {
  it('retorna success=false quando não elegível', async () => {
    const db = makeFullDb({ policy: { max_times_per_year: 2, max_debt_cents: 10000, enabled: true }, countThisYear: 2 });
    const result = await executeTrustUnlock(db, 't1', 'c1', 5000);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('limit_reached');
  });

  it('retorna success=false quando insert falha', async () => {
    const db = makeFullDb({ countThisYear: 0, insertError: true });
    const result = await executeTrustUnlock(db, 't1', 'c1', 5000);
    expect(result.success).toBe(false);
  });

  it('retorna success=true e mensagem com remanescentes quando elegível', async () => {
    const db = makeFullDb({ countThisYear: 0 });
    const result = await executeTrustUnlock(db, 't1', 'c1', 5000);
    expect(result.success).toBe(true);
    expect(result.message).toContain('religado por confiança');
    expect(result.message).toContain('1 religue');
  });

  it('mensagem especial quando é o último religue do ano', async () => {
    const db = makeFullDb({
      policy: { max_times_per_year: 2, max_debt_cents: 20000, enabled: true },
      countThisYear: 1,
    });
    const result = await executeTrustUnlock(db, 't1', 'c1', 5000);
    expect(result.success).toBe(true);
    expect(result.message).toContain('último religue');
  });
});
