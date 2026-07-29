import { describe, it, expect, vi } from 'vitest';
import { publishPlaybook, listPlaybooks, installPlaybook, type PlaybookPorts } from './playbook-market.service';

vi.mock('./policy-backtest.service', () => ({
  runBacktest: vi.fn().mockResolvedValue({
    invoiceCount: 120,
    disclaimer: 'o passado não reage',
    scenarios: {
      base: { recoveredCents: 1500_00, newlyCollectedPct: 22 },
      pessimistic: { recoveredCents: 800_00, newlyCollectedPct: 12 },
      optimistic: { recoveredCents: 2100_00, newlyCollectedPct: 30 },
    },
  }),
}));

const makeDb = (playbooks: any[] = [], installs: any[] = []) => ({
  from: (table: string) => ({
    insert: () => ({ select: () => ({ single: () => ({ data: { id: 'pb-1', name: 'Régua 22%', category: 'cobranca', metrics: {} }, error: null }) }) }),
    upsert: () => ({ select: () => ({ single: () => ({ data: { id: 'inst-1' }, error: null }) }) }),
    select: (cols?: string) => ({
      eq: (_f: string, v: any) => ({
        eq: () => ({ maybeSingle: () => ({ data: playbooks.find((p: any) => p.id === v) ?? playbooks[0] ?? null, error: null }) }),
        maybeSingle: () => ({ data: playbooks.find((p: any) => p.id === v) ?? null, error: null }),
        order: () => ({ data: playbooks, error: null }),
      }),
      order: () => ({ data: playbooks, error: null }),
    }),
    update: () => ({ eq: () => ({ eq: () => ({ error: null }) }) }),
  }),
} as any);

const makePorts = (playbooks: any[] = []): PlaybookPorts => ({
  db: makeDb(playbooks),
});

const testPolicy = {
  reminderDaysBefore: 3,
  remindersAfterDue: [3, 7],
  settlementDiscountPct: 10,
  primaryChannel: 'whatsapp' as const,
};

describe('D-17 publishPlaybook', () => {
  it('publica playbook e retorna id', async () => {
    const result = await publishPlaybook('ten-1', {
      name: 'Régua 22%',
      policy: testPolicy,
      metrics: { recovery_rate_improvement: 22 },
    }, makePorts());
    expect(result.playbookId).toBe('pb-1');
    expect(result.name).toBe('Régua 22%');
  });
});

describe('D-17 listPlaybooks', () => {
  it('retorna lista pública', async () => {
    const pbs = [{ id: 'pb-1', name: 'Régua 22%', category: 'cobranca', downloads: 5 }];
    const result = await listPlaybooks(undefined, makePorts(pbs));
    expect(result).toHaveLength(1);
  });
});

describe('D-17 installPlaybook', () => {
  it('instala com backtesting e retorna resultado', async () => {
    const pbs = [{
      id: 'pb-1', name: 'Régua 22%', policy: testPolicy, downloads: 0,
    }];
    const result = await installPlaybook('ten-2', 'pb-1', {}, makePorts(pbs));
    expect(result.installId).toBe('inst-1');
    expect(result.backtestResult).not.toBeNull();
    expect(result.backtestResult).toHaveProperty('baseProjection');
  });

  it('instala sem backtest quando skipBacktest=true', async () => {
    const pbs = [{ id: 'pb-1', name: 'Régua 22%', policy: testPolicy, downloads: 0 }];
    const result = await installPlaybook('ten-2', 'pb-1', { skipBacktest: true }, makePorts(pbs));
    expect(result.backtestResult).toBeNull();
  });

  it('lida com backtest indisponível (dados insuficientes)', async () => {
    const { runBacktest } = await import('./policy-backtest.service');
    vi.mocked(runBacktest).mockRejectedValueOnce(new Error('menos de 30 faturas'));
    const pbs = [{ id: 'pb-1', name: 'Régua 22%', policy: testPolicy, downloads: 0 }];
    const result = await installPlaybook('ten-2', 'pb-1', {}, makePorts(pbs));
    expect(result.backtestResult).toHaveProperty('error');
    expect(result.backtestResult!['note']).toContain('insuficientes');
  });
});
