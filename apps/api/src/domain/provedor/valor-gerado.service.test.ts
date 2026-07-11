import { describe, it, expect, vi } from 'vitest';
import {
  computeValorGerado,
  generateCase,
  type ValorGeradoDb,
} from './valor-gerado.service';

function makeDb(overrides: Partial<ValorGeradoDb> = {}): ValorGeradoDb {
  return {
    getRecoveredCents: vi.fn().mockResolvedValue(500_000),   // R$ 5.000
    getAiResolutions: vi.fn().mockResolvedValue({ aiResolved: 84, total: 100 }),
    getAiCostUsd: vi.fn().mockResolvedValue(10),             // $10
    getTicketsAvoided: vi.fn().mockResolvedValue(60),
    saveCase: vi.fn().mockResolvedValue('abc123token'),
    getCaseByToken: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('computeValorGerado', () => {
  it('calcula todos os KPIs corretamente', async () => {
    const db = makeDb();
    const kpis = await computeValorGerado(db, 'tenant-1', 30);

    expect(kpis.tenantId).toBe('tenant-1');
    expect(kpis.period).toBe('30d');
    expect(kpis.periodDays).toBe(30);
    expect(kpis.recoveredCents).toBe(500_000);
    expect(kpis.recoveredBrl).toBe(5000);
    expect(kpis.aiResolved).toBe(84);
    expect(kpis.totalAttendances).toBe(100);
    expect(kpis.aiResolutionRatePct).toBe(84);
    expect(kpis.hoursSaved).toBe(21);     // 84 × 15min / 60
    expect(kpis.ticketsAvoided).toBe(60);
    expect(kpis.aiCostUsd).toBe(10);
  });

  it('calcula ROI corretamente (R$/custo USD×5.2)', async () => {
    const db = makeDb({
      getRecoveredCents: vi.fn().mockResolvedValue(520_000), // R$ 5.200
      getAiCostUsd: vi.fn().mockResolvedValue(10),           // $10 × 5.2 = R$52
    });
    const kpis = await computeValorGerado(db, 't', 30);
    // 5200 / 52 = 100
    expect(kpis.roiMultiple).toBe(100);
  });

  it('ROI = 999 quando custo IA é zero mas há recuperação', async () => {
    const db = makeDb({
      getAiCostUsd: vi.fn().mockResolvedValue(0),
      getRecoveredCents: vi.fn().mockResolvedValue(100_000),
    });
    const kpis = await computeValorGerado(db, 't', 30);
    expect(kpis.roiMultiple).toBe(999);
  });

  it('ROI = 0 quando custo e recuperação são zero', async () => {
    const db = makeDb({
      getAiCostUsd: vi.fn().mockResolvedValue(0),
      getRecoveredCents: vi.fn().mockResolvedValue(0),
    });
    const kpis = await computeValorGerado(db, 't', 30);
    expect(kpis.roiMultiple).toBe(0);
  });

  it('aiResolutionRatePct = 0 quando total de atendimentos é zero', async () => {
    const db = makeDb({
      getAiResolutions: vi.fn().mockResolvedValue({ aiResolved: 0, total: 0 }),
    });
    const kpis = await computeValorGerado(db, 't', 30);
    expect(kpis.aiResolutionRatePct).toBe(0);
    expect(kpis.hoursSaved).toBe(0);
  });

  it('arredonda aiResolutionRatePct para 1 casa decimal', async () => {
    const db = makeDb({
      getAiResolutions: vi.fn().mockResolvedValue({ aiResolved: 1, total: 3 }),
    });
    const kpis = await computeValorGerado(db, 't', 30);
    // 1/3 = 33.333... → 33.3
    expect(kpis.aiResolutionRatePct).toBe(33.3);
  });

  it('calcula hoursSaved com 1 casa decimal', async () => {
    const db = makeDb({
      getAiResolutions: vi.fn().mockResolvedValue({ aiResolved: 10, total: 20 }),
    });
    const kpis = await computeValorGerado(db, 't', 30);
    // 10 × 15 / 60 = 2.5h
    expect(kpis.hoursSaved).toBe(2.5);
  });

  it('funciona com period 7d', async () => {
    const db = makeDb();
    const kpis = await computeValorGerado(db, 't', 7);
    expect(kpis.period).toBe('7d');
    expect(kpis.periodDays).toBe(7);
  });

  it('funciona com period 90d', async () => {
    const db = makeDb();
    const kpis = await computeValorGerado(db, 't', 90);
    expect(kpis.period).toBe('90d');
  });

  it('inclui metodologia com texto auditável', async () => {
    const db = makeDb();
    const kpis = await computeValorGerado(db, 't', 30);
    expect(kpis.methodology.recoveredNote).toContain('cobrai_jobs');
    expect(kpis.methodology.hoursSavedNote).toContain('15 min');
    expect(kpis.methodology.roiNote).toContain('USD');
  });

  it('passa tenantId correto para todas as queries', async () => {
    const db = makeDb();
    await computeValorGerado(db, 'tenant-xyz', 30);
    expect(db.getRecoveredCents).toHaveBeenCalledWith('tenant-xyz', expect.any(Date));
    expect(db.getAiResolutions).toHaveBeenCalledWith('tenant-xyz', expect.any(Date));
    expect(db.getAiCostUsd).toHaveBeenCalledWith('tenant-xyz', expect.any(Date));
    expect(db.getTicketsAvoided).toHaveBeenCalledWith('tenant-xyz', expect.any(Date));
  });
});

describe('generateCase', () => {
  it('retorna kpis e shareToken', async () => {
    const db = makeDb();
    const result = await generateCase(db, 'tenant-1', 30);
    expect(result.kpis).toBeDefined();
    expect(result.shareToken).toBe('abc123token');
  });

  it('chama saveCase com dados corretos do período', async () => {
    const db = makeDb({
      getRecoveredCents: vi.fn().mockResolvedValue(200_000),
      getAiResolutions: vi.fn().mockResolvedValue({ aiResolved: 50, total: 60 }),
    });
    await generateCase(db, 'tenant-1', 30);
    expect(db.saveCase).toHaveBeenCalledWith('tenant-1', expect.objectContaining({
      period: '30d',
      periodDays: 30,
      recoveredCents: 200_000,
      aiResolved: 50,
    }));
  });
});
