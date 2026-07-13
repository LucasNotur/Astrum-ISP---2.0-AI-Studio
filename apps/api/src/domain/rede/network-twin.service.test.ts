import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  iaLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import supabase from '../../infrastructure/database/supabase.client';
import { haversineKm, simulateCtoFailure, simulateGrowth } from './network-twin.service';

const CTOS = [
  { id: 'cto-a', name: 'CTO-CENTRO', latitude: -22.30, longitude: -47.60, total_ports: 16, used_ports: 16, status: 'active' },
  { id: 'cto-b', name: 'CTO-PERTO', latitude: -22.301, longitude: -47.601, total_ports: 16, used_ports: 10, status: 'active' }, // 6 livres, ~0.15km
  { id: 'cto-c', name: 'CTO-LONGE', latitude: -22.35, longitude: -47.68, total_ports: 32, used_ports: 2, status: 'active' },   // 30 livres, ~9km
  { id: 'cto-d', name: 'CTO-MORTA', latitude: -22.31, longitude: -47.61, total_ports: 16, used_ports: 0, status: 'inactive' },
];

function chain(data: any[]) {
  const c: any = {
    select: () => c, eq: () => c, gte: () => c, limit: () => c,
    then: (cb: any) => Promise.resolve({ data, error: null }).then(cb),
  };
  return c;
}

function mockDb(opts: { customersOnCto?: any[]; tickets90d?: any[]; actives?: any[] }) {
  let customersCall = 0;
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    if (table === 'network_ctos') return chain(CTOS);
    if (table === 'tickets') return chain(opts.tickets90d ?? []);
    if (table === 'customers') {
      // 1ª chamada nas simulações de falha: clientes da CTO; nas seguintes: ativos gerais
      customersCall++;
      if (opts.customersOnCto && customersCall === 1) return chain(opts.customersOnCto);
      return chain(opts.actives ?? []);
    }
    throw new Error(`tabela inesperada: ${table}`);
  }) as any);
}

describe('haversineKm', () => {
  it('distâncias plausíveis (mesmo ponto = 0; ~1 grau lat ≈ 111km)', () => {
    expect(haversineKm(-22.3, -47.6, -22.3, -47.6)).toBe(0);
    const d = haversineKm(-22.0, -47.6, -23.0, -47.6);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });
});

describe('simulateCtoFailure — "se esta CTO cair, quem grita?"', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mede afetados, MRR em risco, tickets previstos e plano de realocação', async () => {
    mockDb({
      customersOnCto: Array.from({ length: 10 }, () => ({ id: 'c', mrr_cents: 9990 })),
      tickets90d: Array.from({ length: 30 }, () => ({ id: 't' })),
      actives: Array.from({ length: 100 }, () => ({ id: 'c' })),
    });
    const r = await simulateCtoFailure('t1', 'cto-a');
    expect(r.affectedCustomers).toBe(10);
    expect(r.mrrAtRiskCents).toBe(99900);
    expect(r.predictedTickets).toBe(6); // 60% na 1ª hora
    // vizinha mais próxima primeiro; a inativa não entra
    expect(r.reallocation[0]!.ctoId).toBe('cto-b');
    expect(r.reallocation.map((n) => n.ctoId)).not.toContain('cto-d');
    // capacidade 6+30 = 36 ≥ 10 afetados → ninguém no escuro
    expect(r.strandedCustomers).toBe(0);
    expect(r.assumptions.length).toBeGreaterThan(0);
  });

  it('quando as vizinhas não comportam, conta os clientes sem porta (stranded)', async () => {
    mockDb({
      customersOnCto: Array.from({ length: 50 }, () => ({ id: 'c', mrr_cents: 10000 })),
      tickets90d: [], actives: [{ id: 'c' }],
    });
    const r = await simulateCtoFailure('t1', 'cto-a');
    expect(r.strandedCustomers).toBe(50 - 36);
  });

  it('CTO inexistente → erro claro', async () => {
    mockDb({ customersOnCto: [], tickets90d: [], actives: [] });
    await expect(simulateCtoFailure('t1', 'nao-existe')).rejects.toThrow('não encontrada');
  });
});

describe('simulateGrowth — "se eu ganhar N clientes aqui"', () => {
  beforeEach(() => vi.clearAllMocks());

  it('CTO cheia transborda para as vizinhas e projeta o MRR do crescimento', async () => {
    mockDb({ actives: [{ mrr_cents: 10000 }, { mrr_cents: 20000 }] }); // média 15000
    const r = await simulateGrowth('t1', 'cto-a', 10, null); // cto-a: 0 livres
    expect(r.freePortsBefore).toBe(0);
    expect(r.absorbed).toBe(0);
    expect(r.spillover[0]!.ctoId).toBe('cto-b');
    expect(r.spillover[0]!.absorbs).toBe(6);
    expect(r.spillover[1]!.absorbs).toBe(4);
    expect(r.overflow).toBe(0);
    expect(r.capexNeeded).toBe(false);
    expect(r.projectedMrrGainCents).toBe(10 * 15000);
  });

  it('crescimento maior que a região inteira → CAPEX necessário', async () => {
    mockDb({ actives: [{ mrr_cents: 10000 }] });
    const r = await simulateGrowth('t1', 'cto-a', 100, 10000);
    expect(r.overflow).toBe(100 - 36);
    expect(r.capexNeeded).toBe(true);
    expect(r.assumptions.join(' ')).toContain('CAPEX');
  });

  it('rejeita crescimento não-positivo', async () => {
    mockDb({ actives: [] });
    await expect(simulateGrowth('t1', 'cto-a', 0, null)).rejects.toThrow('> 0');
  });
});
