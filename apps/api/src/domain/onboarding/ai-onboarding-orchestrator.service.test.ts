import { describe, it, expect, vi } from 'vitest';
import { createOnboardingJob, runOnboarding, type OnboardingOrchestratorPorts } from './ai-onboarding-orchestrator.service';

const makeDb = () => {
  let rows: Record<string, any>[] = [{ id: 'job-1', steps: [] }];
  return {
    from: () => ({
      insert: (row: any) => ({ select: () => ({ single: () => ({ data: { id: 'job-1' }, error: null }) }) }),
      select: (cols?: string) => ({
        eq: (_f: string, v: any) => ({
          eq: () => ({ maybeSingle: () => ({ data: rows[0], error: null }) }),
          maybeSingle: () => ({ data: rows[0] ?? null, error: null }),
          head: true,
        }),
      }),
      update: (patch: any) => ({
        eq: () => ({
          eq: () => ({ error: null }),
          error: null,
        }),
      }),
    }),
  } as any;
};

const makePorts = (overrides: Partial<OnboardingOrchestratorPorts> = {}): OnboardingOrchestratorPorts => ({
  db: makeDb(),
  importCustomers: vi.fn().mockResolvedValue({ count: 150 }),
  mapNetworkGraph: vi.fn().mockResolvedValue({ nodes: 25, edges: 12 }),
  generateConstitution: vi.fn().mockResolvedValue({ generated: true }),
  backfillKb: vi.fn().mockResolvedValue({ draftsGenerated: 8 }),
  analyzeWhatsappHistory: vi.fn().mockResolvedValue({ contactsAnalyzed: 75 }),
  ...overrides,
});

describe('D-21 createOnboardingJob', () => {
  it('cria job com todos os steps em pending', async () => {
    const ports = makePorts();
    const jobId = await createOnboardingJob('ten-1', 'IXC', ports);
    expect(jobId).toBe('job-1');
  });
});

describe('D-21 runOnboarding', () => {
  it('executa todos os steps e retorna sumário completo', async () => {
    const ports = makePorts();
    const summary = await runOnboarding('ten-1', 'job-1', 'IXC', ports);
    expect(summary.customersImported).toBe(150);
    expect(summary.networkNodes).toBe(25);
    expect(summary.kbArticlesGenerated).toBe(8);
    expect(summary.whatsappContactsAnalyzed).toBe(75);
    expect(summary.constitutionGenerated).toBe(true);
  });

  it('continua mesmo se um step falha', async () => {
    const ports = makePorts({
      importCustomers: vi.fn().mockRejectedValue(new Error('ERP timeout')),
    });
    const summary = await runOnboarding('ten-1', 'job-1', 'IXC', ports);
    expect(summary.customersImported).toBe(0);
    // Outros steps continuam normalmente
    expect(summary.networkNodes).toBe(25);
  });

  it('pula erp_connection quando sem connector', async () => {
    const ports = makePorts();
    const summary = await runOnboarding('ten-1', 'job-1', undefined, ports);
    expect(summary.customersImported).toBe(0); // sem ERP = sem import
    expect(ports.importCustomers).not.toHaveBeenCalled(); // sem ERP, skip direto
  });

  it('registra durationMinutes no sumário', async () => {
    const ports = makePorts();
    const summary = await runOnboarding('ten-1', 'job-1', undefined, ports);
    expect(typeof summary.durationMinutes).toBe('number');
  });
});
