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
import {
  canTransition,
  scanForIncidents,
  transitionIncident,
  communicateIncident,
  normalizeIncident,
  isNocAutonomoEnabled,
} from './incident-orchestrator.service';

describe('máquina de estados D-04', () => {
  it('segue suspeita → confirmada → comunicada → normalizada', () => {
    expect(canTransition('suspeita', 'confirmada')).toBe(true);
    expect(canTransition('confirmada', 'comunicada')).toBe(true);
    expect(canTransition('comunicada', 'normalizada')).toBe(true);
  });

  it('proíbe pular etapas e reviver terminais', () => {
    expect(canTransition('suspeita', 'comunicada')).toBe(false);
    expect(canTransition('suspeita', 'normalizada')).toBe(false);
    expect(canTransition('normalizada', 'suspeita')).toBe(false);
    expect(canTransition('cancelada', 'confirmada')).toBe(false);
  });

  it('cancelamento permitido de qualquer estado não-terminal', () => {
    expect(canTransition('suspeita', 'cancelada')).toBe(true);
    expect(canTransition('confirmada', 'cancelada')).toBe(true);
    expect(canTransition('comunicada', 'cancelada')).toBe(true);
  });

  it('flag desligada por padrão', () => {
    delete process.env.NOC_AUTONOMO_ENABLED;
    expect(isNocAutonomoEnabled()).toBe(false);
  });
});

// ── helpers de mock de banco ─────────────────────────────────────────────────

function makeChain(data: any) {
  const chain: any = {
    select: () => chain, eq: () => chain, gte: () => chain, in: () => chain,
    order: () => chain, maybeSingle: async () => ({ data, error: null }),
    then: (cb: any) => Promise.resolve({ data, error: null }).then(cb),
  };
  return chain;
}

describe('scanForIncidents', () => {
  beforeEach(() => vi.clearAllMocks());

  function seriesFor(ctoId: string, anomalous: boolean) {
    // 40 pontos estáveis; os 3 últimos explodem quando anomalous
    return Array.from({ length: 40 }, (_, i) => ({
      cto_id: ctoId,
      value: anomalous && i >= 37 ? 300 : 15 + (i % 3),
      collected_at: new Date(Date.UTC(2026, 5, 1 + i)).toISOString(),
    }));
  }

  it('abre incidente suspeita só para a CTO anômala (com dedupe de abertos)', async () => {
    const inserted: any[] = [];
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'network_metrics') {
        return makeChain([...seriesFor('cto-ok', false), ...seriesFor('cto-ruim', true)]);
      }
      if (table === 'incidents') {
        return {
          ...makeChain([]),
          insert: async (row: any) => { inserted.push(row); return { error: null }; },
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    }) as any);

    const r = await scanForIncidents('t1');
    expect(r.anomalousCtos).toEqual(['cto-ruim']);
    expect(r.opened).toBe(1);
    expect(inserted[0].status).toBe('suspeita');
    expect(inserted[0].cto_id).toBe('cto-ruim');
  });

  it('não duplica incidente para CTO que já tem um aberto', async () => {
    const inserted: any[] = [];
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'network_metrics') return makeChain(seriesFor('cto-ruim', true));
      if (table === 'incidents') {
        return {
          ...makeChain([{ cto_id: 'cto-ruim' }]),
          insert: async (row: any) => { inserted.push(row); return { error: null }; },
        };
      }
      throw new Error(`tabela: ${table}`);
    }) as any);

    const r = await scanForIncidents('t1');
    expect(r.anomalousCtos).toEqual(['cto-ruim']);
    expect(r.opened).toBe(0);
    expect(inserted).toHaveLength(0);
  });
});

describe('transitionIncident / communicateIncident', () => {
  beforeEach(() => vi.clearAllMocks());

  function mockIncidentDb(incident: any) {
    const updates: any[] = [];
    const notifications: any[] = [];
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'incidents') {
        const chain: any = {
          select: () => chain, eq: () => chain,
          maybeSingle: async () => ({ data: incident, error: null }),
          update: (patch: any) => {
            updates.push(patch);
            const uc: any = { eq: () => uc, then: (cb: any) => Promise.resolve({ error: null }).then(cb) };
            return uc;
          },
        };
        return chain;
      }
      if (table === 'customers') return makeChain([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]);
      if (table === 'outage_notifications') {
        return { insert: async (row: any) => { notifications.push(row); return { error: null }; } };
      }
      throw new Error(`tabela: ${table}`);
    }) as any);
    return { updates, notifications };
  }

  it('confirmar mede o raio da explosão (clientes ativos da CTO)', async () => {
    const { updates } = mockIncidentDb({ id: 'i1', status: 'suspeita', cto_id: 'cto-1' });
    await transitionIncident('t1', 'i1', 'confirmada');
    expect(updates[0].status).toBe('confirmada');
    expect(updates[0].affected_customers).toBe(3);
    expect(updates[0].confirmed_at).toBeDefined();
  });

  it('transição inválida lança e não escreve nada', async () => {
    const { updates } = mockIncidentDb({ id: 'i1', status: 'suspeita', cto_id: 'cto-1' });
    await expect(transitionIncident('t1', 'i1', 'normalizada')).rejects.toThrow('transição inválida');
    expect(updates).toHaveLength(0);
  });

  it('comunicar registra a notificação em massa e move o estado', async () => {
    const { updates, notifications } = mockIncidentDb({
      id: 'i1', status: 'confirmada', cto_id: 'cto-1', affected_customers: 42,
    });
    const r = await communicateIncident('t1', 'i1', undefined);
    expect(r.customerCount).toBe(42);
    expect(notifications[0].customer_count).toBe(42);
    expect(notifications[0].message).toContain('instabilidade');
    expect(updates.some((u) => u.status === 'comunicada')).toBe(true);
  });

  it('comunicar direto de suspeita é bloqueado (precisa confirmar antes)', async () => {
    const { notifications } = mockIncidentDb({ id: 'i1', status: 'suspeita', cto_id: 'cto-1' });
    await expect(communicateIncident('t1', 'i1', undefined)).rejects.toThrow('transição inválida');
    expect(notifications).toHaveLength(0);
  });

  it('normalizar após comunicada envia a confirmação aos afetados', async () => {
    const { updates, notifications } = mockIncidentDb({
      id: 'i1', status: 'comunicada', cto_id: 'cto-1', affected_customers: 20,
    });
    const r = await normalizeIncident('t1', 'i1', undefined);
    expect(r.notified).toBe(20);
    expect(notifications[0].message).toContain('normalizada');
    expect(updates.some((u) => u.status === 'normalizada')).toBe(true);
  });

  it('normalizar sem ter comunicado não notifica ninguém', async () => {
    const { notifications } = mockIncidentDb({ id: 'i1', status: 'confirmada', cto_id: 'cto-1', affected_customers: 20 });
    const r = await normalizeIncident('t1', 'i1', undefined);
    expect(r.notified).toBe(0);
    expect(notifications).toHaveLength(0);
  });
});
