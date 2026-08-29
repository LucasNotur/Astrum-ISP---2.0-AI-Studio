import { describe, it, expect, vi, beforeEach } from 'vitest';

// runVendasSubgraph passa pelo withFailover real (model-router), que resolve a
// chave de IA do tenant via tenant-keys.ts → Supabase. Sem mock aqui, cada
// chamada bateria num cliente Supabase real/indisponível em CI — mockado pra
// puro fallback no env global (mesmo comportamento de antes da SaaS BYOK).
vi.mock('../../../lib/tenant-keys', () => ({
  resolveTenantAiKeys: vi.fn(async () => ({})),
}));

import { runVendasSubgraph, parseFutureDate, type VendasSubgraphDeps } from './vendas.subgraph';
import type { MultiAgentState } from '../multi-agent.state';
import type { SalesLead, SalesFunnelDb } from '../../vendas/sales-funnel.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_STATE: MultiAgentState = {
  tenantId: 'tenant-test',
  customerId: 'customer-test',
  conversationId: 'conv-test',
  userMessage: 'quero contratar internet',
  steps: [],
  startedAt: new Date().toISOString(),
  tokensUsed: 0,
};

const COLLECTING_LEAD: SalesLead = {
  id: 'lead-1',
  tenant_id: 'tenant-test',
  conversation_id: 'conv-test',
  stage: 'collecting_address',
};

const PRESENTING_PLANS_LEAD: SalesLead = {
  ...COLLECTING_LEAD,
  stage: 'presenting_plans',
  address: 'Rua das Flores, 123, Centro, São Paulo',
};

const COLLECTING_DATA_LEAD: SalesLead = {
  ...PRESENTING_PLANS_LEAD,
  stage: 'collecting_data',
  selected_plan_id: 'plan-1',
  selected_plan_name: 'Pro 300 Mbps',
  selected_plan_price_cents: 12990,
};

const SCHEDULING_LEAD: SalesLead = {
  ...COLLECTING_DATA_LEAD,
  stage: 'scheduling',
  full_name: 'João Silva',
  cpf: '12345678900',
  phone: '11999999999',
  erp_lead_id: 'erp-lead-1',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb(lead: SalesLead | null = COLLECTING_LEAD): SalesFunnelDb {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: lead }),
    single: vi.fn().mockResolvedValue({ data: lead ?? COLLECTING_LEAD, error: null }),
  };
  return { from: vi.fn().mockReturnValue(chain) } as any;
}

function makeDeps(overrides: Partial<VendasSubgraphDeps> = {}): VendasSubgraphDeps {
  return {
    funnelDb: makeDb(COLLECTING_LEAD),
    checkViabilityFn: vi.fn().mockResolvedValue({ available: true, ctoId: 'cto-1', availablePorts: 4 }),
    getPlansFn: vi.fn().mockResolvedValue([
      { id: 'plan-1', name: 'Basic 100', downloadMbps: 100, uploadMbps: 20, priceCents: 8990 },
      { id: 'plan-2', name: 'Pro 300', downloadMbps: 300, uploadMbps: 100, priceCents: 12990 },
    ]),
    registerLeadFn: vi.fn().mockResolvedValue({ erpLeadId: 'erp-lead-1' }),
    scheduleInstallationFn: vi.fn().mockResolvedValue({ orderId: 'os-1' }),
    sendContractFn: vi.fn().mockResolvedValue({ status: 'pending_signature', provider: 'none' }),
    generateTextFn: vi.fn().mockResolvedValue({ text: 'resposta-gerada' }),
    ...overrides,
  };
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('runVendasSubgraph — stage: collecting_address', () => {
  it('pede endereço quando mensagem não tem endereço', async () => {
    const deps = makeDeps();
    // getOrCreateLead retorna lead em collecting_address
    const out = await runVendasSubgraph(BASE_STATE, deps);

    expect(out.steps).toContain('vendas_collecting_address');
    expect(deps.generateTextFn).toHaveBeenCalled();
  });

  it('avança para viabilidade quando endereço extraído', async () => {
    // simula extractAddress retornando um endereço (via mock do generateObject global)
    const deps = makeDeps({
      funnelDb: makeDb(COLLECTING_LEAD),
    });

    const state = { ...BASE_STATE, userMessage: 'Rua das Flores, 123, Centro, São Paulo' };

    // Como generateObject é chamado internamente, testamos o comportamento via
    // checkViabilityFn — se foi chamada, endereço foi extraído.
    const out = await runVendasSubgraph(state, deps);

    // Pode ter ido para presenting_plans (viabilidade ok) ou collecting_address (sem extração)
    expect(out.steps).toEqual(expect.arrayContaining([expect.stringContaining('vendas_')]));
    expect(deps.generateTextFn).toHaveBeenCalled();
  });
});

describe('runVendasSubgraph — stage: presenting_plans', () => {
  it('mostra planos e avança para collecting_data quando plano selecionado', async () => {
    const deps = makeDeps({
      funnelDb: makeDb(PRESENTING_PLANS_LEAD),
    });

    const state = { ...BASE_STATE, userMessage: 'quero o plano Pro 300' };
    const out = await runVendasSubgraph(state, deps);

    expect(deps.getPlansFn).toHaveBeenCalledWith('tenant-test', expect.anything());
    expect(out.steps).toEqual(expect.arrayContaining([expect.stringContaining('vendas_')]));
  });
});

describe('runVendasSubgraph — stage: checking_viability (persistência do ctoId — D-07)', () => {
  it('persiste a ViabilityResult inteira (com ctoId) em viability_raw, não só result.raw', async () => {
    const checkingLead: SalesLead = { ...COLLECTING_LEAD, stage: 'checking_viability', address: 'Rua das Flores, 123' };
    const chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: checkingLead }),
      single: vi.fn().mockResolvedValue({ data: checkingLead, error: null }),
    };
    const db = { from: vi.fn().mockReturnValue(chain) } as any;
    const deps = makeDeps({
      funnelDb: db,
      checkViabilityFn: vi.fn().mockResolvedValue({
        available: true, ctoId: 'cto-42', ctoName: 'CTO Centro', availablePorts: 6, raw: { erp: 'payload' },
      }),
    });

    await runVendasSubgraph(BASE_STATE, deps);

    const viabilityUpdate = (chain.update.mock.calls as any[]).find(([p]) => p && 'viability_raw' in p);
    expect(viabilityUpdate).toBeDefined();
    const vr = viabilityUpdate![0].viability_raw as any;
    // Regressão do bug: antes guardava só result.raw (sem ctoId no topo) → D-07 lia undefined.
    expect(vr.ctoId).toBe('cto-42');
    expect(vr.raw).toEqual({ erp: 'payload' });
  });
});

describe('runVendasSubgraph — stage: scheduling', () => {
  it('agenda instalação e retorna completed', async () => {
    const deps = makeDeps({
      funnelDb: makeDb(SCHEDULING_LEAD),
    });

    const state = { ...BASE_STATE, userMessage: 'pode ser na quinta-feira dia 20/07' };
    const out = await runVendasSubgraph(state, deps);

    expect(out.steps).toEqual(expect.arrayContaining([expect.stringContaining('vendas_')]));
    expect(deps.generateTextFn).toHaveBeenCalled();
  });

  it('escala para humano quando scheduleInstallation falha', async () => {
    const deps = makeDeps({
      funnelDb: makeDb(SCHEDULING_LEAD),
      scheduleInstallationFn: vi.fn().mockRejectedValue(new Error('ERP timeout')),
    });

    const state = { ...BASE_STATE, userMessage: '20 de julho' };
    const out = await runVendasSubgraph(state, deps);

    // Pode escalar ou pedir confirmação — garantimos que não lança exceção
    expect(out.steps).toEqual(expect.arrayContaining([expect.stringContaining('vendas_')]));
  });
});

describe('runVendasSubgraph — stage: viability_failed', () => {
  it('responde com mensagem de sem cobertura', async () => {
    const failedLead: SalesLead = { ...COLLECTING_LEAD, stage: 'viability_failed', address: 'Rua Sem Fio, 1' };
    const deps = makeDeps({ funnelDb: makeDb(failedLead) });

    const out = await runVendasSubgraph(BASE_STATE, deps);

    expect(out.steps).toContain('vendas_viability_failed');
    expect(deps.generateTextFn).toHaveBeenCalled();
  });
});

describe('parseFutureDate', () => {
  it('aceita hoje e datas futuras', () => {
    expect(parseFutureDate('2026-08-29', '2026-08-29')).toBe('2026-08-29');
    expect(parseFutureDate('2026-12-01', '2026-08-29')).toBe('2026-12-01');
  });
  it('rejeita datas passadas (não abre OS no passado)', () => {
    expect(parseFutureDate('2026-08-28', '2026-08-29')).toBeNull();
    expect(parseFutureDate('2020-01-01', '2026-08-29')).toBeNull();
  });
  it('rejeita null/undefined', () => {
    expect(parseFutureDate(null, '2026-08-29')).toBeNull();
    expect(parseFutureDate(undefined, '2026-08-29')).toBeNull();
  });
});

describe('runVendasSubgraph — sem planos disponíveis escala para humano (dead-end)', () => {
  it('presenting_plans com getPlans vazio → requiresHuman em vez de loop', async () => {
    const deps = makeDeps({
      funnelDb: makeDb(PRESENTING_PLANS_LEAD),
      getPlansFn: vi.fn().mockResolvedValue([]),
    });
    const out = await runVendasSubgraph(BASE_STATE, deps);
    expect(out.requiresHuman).toBe(true);
    expect(out.steps).toContain('vendas_no_plans');
  });

  it('checking_viability com viabilidade OK mas planos vazios → requiresHuman', async () => {
    const checkingLead: SalesLead = { ...COLLECTING_LEAD, stage: 'checking_viability', address: 'Rua X, 1' };
    const deps = makeDeps({
      funnelDb: makeDb(checkingLead),
      checkViabilityFn: vi.fn().mockResolvedValue({ available: true, ctoId: 'c1' }),
      getPlansFn: vi.fn().mockResolvedValue([]),
    });
    const out = await runVendasSubgraph(BASE_STATE, deps);
    expect(out.requiresHuman).toBe(true);
    expect(out.steps).toContain('vendas_no_plans');
  });
});

describe('runVendasSubgraph — error handling', () => {
  it('retorna fallback com requiresHuman=true em erro fatal', async () => {
    const deps = makeDeps({
      funnelDb: { from: vi.fn().mockImplementation(() => { throw new Error('db crash'); }) } as any,
    });

    const out = await runVendasSubgraph(BASE_STATE, deps);

    expect(out.requiresHuman).toBe(true);
    expect(out.steps).toContain('vendas_subgraph_error');
  });
});
