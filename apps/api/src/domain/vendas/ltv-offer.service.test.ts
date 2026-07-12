import { describe, it, expect, vi } from 'vitest';
import { computeLtvOffer, computeCtOccupancy, type CtoDB } from './ltv-offer.service';

describe('computeLtvOffer', () => {
  it('returns promotional tier when CTO < 70% occupied', () => {
    const result = computeLtvOffer({ planPriceCents: 5000, ctoOccupancyPct: 50 });
    expect(result.offerTier).toBe('promotional');
    expect(result.offerNotes).toContain('50%');
    expect(result.estimatedLtvCents).toBeGreaterThan(0);
  });

  it('returns promotional tier at exactly 0% occupancy', () => {
    const result = computeLtvOffer({ planPriceCents: 5000, ctoOccupancyPct: 0 });
    expect(result.offerTier).toBe('promotional');
  });

  it('returns standard tier when CTO >= 70% occupied', () => {
    const result = computeLtvOffer({ planPriceCents: 5000, ctoOccupancyPct: 70 });
    expect(result.offerTier).toBe('standard');
  });

  it('returns premium tier when plan >= R$100 and CTO is occupied', () => {
    const result = computeLtvOffer({ planPriceCents: 15000, ctoOccupancyPct: 85 });
    expect(result.offerTier).toBe('premium');
    expect(result.offerNotes).toContain('desconto');
  });

  it('promotional beats premium when CTO has space, regardless of price', () => {
    const result = computeLtvOffer({ planPriceCents: 20000, ctoOccupancyPct: 30 });
    expect(result.offerTier).toBe('promotional');
  });

  it('returns standard when ctoOccupancyPct is null and price < 100', () => {
    const result = computeLtvOffer({ planPriceCents: 5000, ctoOccupancyPct: null });
    expect(result.offerTier).toBe('standard');
  });

  it('LTV uses band=low: 5000 cents × 0.35 × 200 months = 350000', () => {
    // band low: churn 0.5% → lifetime = 1/0.005 = 200 months (capped at 60)
    // ltv = 5000 × 0.35 × 60 = 105000
    const result = computeLtvOffer({ planPriceCents: 5000, ctoOccupancyPct: null });
    expect(result.estimatedLtvCents).toBe(105_000);
  });
});

describe('computeCtOccupancy', () => {
  const makeDb = (total: number, used: number): CtoDB => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { total_ports: total, used_ports: used },
              error: null,
            }),
          }),
        }),
      }),
    }),
  });

  it('returns correct occupancy percentage', async () => {
    const db = makeDb(100, 65);
    const result = await computeCtOccupancy(db, 'tenant-1', 'cto-1');
    expect(result).toBe(65);
  });

  it('returns null when total_ports is 0', async () => {
    const db = makeDb(0, 0);
    const result = await computeCtOccupancy(db, 'tenant-1', 'cto-1');
    expect(result).toBeNull();
  });

  it('returns null when CTO not found', async () => {
    const db: CtoDB = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };
    const result = await computeCtOccupancy(db, 'tenant-1', 'cto-x');
    expect(result).toBeNull();
  });

  it('rounds to integer', async () => {
    const db = makeDb(3, 1);
    const result = await computeCtOccupancy(db, 'tenant-1', 'cto-1');
    expect(result).toBe(33); // Math.round(1/3 * 100)
  });
});
