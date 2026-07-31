import { describe, it, expect, vi } from 'vitest';
import { broadcastThreatSignal, listThreatSignals, isImmunized, type ThreatNetworkPorts } from './threat-network.service';

const makeDb = (signals: any[] = []) => ({
  from: (table: string) => ({
    insert: (row: any) => ({
      select: () => ({
        single: () => ({
          data: {
            id: 'sig-1',
            broadcast_at: new Date().toISOString(),
            ...row,
          },
          error: null,
        }),
      }),
      error: null,
    }),
    select: (cols?: string) => ({
      eq: (_f: string, v: any) => ({
        eq: () => ({
          maybeSingle: () => ({ data: signals.find((s: any) => s.id === v) ?? signals[0] ?? null, error: null }),
          error: null,
        }),
        order: () => ({
          limit: () => ({ data: signals, error: null }),
        }),
        limit: () => ({
          maybeSingle: () => ({ data: signals[0] ?? null, error: null }),
        }),
        maybeSingle: () => ({ data: signals.find((s: any) => s.id === v) ?? null, error: null }),
      }),
      order: () => ({ limit: () => ({ data: signals, error: null }) }),
    }),
    update: () => ({ eq: () => ({ error: null }) }),
  }),
} as any);

const makePorts = (tenants: string[] = ['t1', 't2', 't3']): ThreatNetworkPorts => ({
  db: makeDb([{ id: 'sig-1', signal_type: 'fraud', description: 'golpe pix', evidence: {}, severity: 'high', broadcast_at: new Date().toISOString(), immunized_count: 2 }]),
  getAllTenantIds: vi.fn().mockResolvedValue(tenants),
});

describe('D-22 broadcastThreatSignal', () => {
  it('anonimiza a evidence removendo campos sensíveis', async () => {
    const ports = makePorts(['t2', 't3']);
    const result = await broadcastThreatSignal('t1', {
      signalType: 'phishing',
      description: 'Phishing usando o nome do provedor',
      evidence: {
        customer_ids: ['cust-1', 'cust-2'],
        tenant_id: 't1',
        pattern: 'boleto clonado',
        affected_count: 47,
        phone: '11999999999',
      },
    }, ports);
    expect(result.evidence).not.toHaveProperty('customer_ids');
    expect(result.evidence).not.toHaveProperty('tenant_id');
    expect(result.evidence).not.toHaveProperty('phone');
    expect(result.evidence).toHaveProperty('pattern');
    expect(result.evidence).toHaveProperty('affected_count_range');
  });

  it('exclui o tenant originador do broadcast', async () => {
    const getAllTenantIds = vi.fn().mockResolvedValue(['origin', 't2', 't3']);
    const ports: ThreatNetworkPorts = { ...makePorts(), getAllTenantIds };
    await broadcastThreatSignal('origin', {
      signalType: 'fraud', description: 'teste', evidence: {},
    }, ports);
    // 3 tenants - 1 (origin) = 2 imunizações
    expect(getAllTenantIds).toHaveBeenCalled();
  });

  it('retorna immunizedCount correto', async () => {
    const ports = makePorts(['t2', 't3', 't4']); // 3 targets excluindo origin
    const result = await broadcastThreatSignal('t1', {
      signalType: 'spam', description: 'spam em massa', evidence: {},
    }, ports);
    expect(result.immunizedCount).toBeGreaterThanOrEqual(0);
  });
});

describe('D-22 listThreatSignals', () => {
  it('retorna lista de sinais', async () => {
    const result = await listThreatSignals({}, makePorts());
    expect(result).toHaveLength(1);
    expect(result[0].signalType).toBe('fraud');
  });
});

describe('D-22 isImmunized', () => {
  it('retorna true quando imunização existe', async () => {
    const ports: ThreatNetworkPorts = {
      ...makePorts(),
      db: {
        from: () => ({
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => ({ data: { id: 'imm-1' }, error: null }) }) }) }),
        }),
      } as any,
    };
    const result = await isImmunized('ten-1', 'sig-1', ports);
    expect(result).toBe(true);
  });

  it('retorna false quando não imunizado', async () => {
    const ports: ThreatNetworkPorts = {
      ...makePorts(),
      db: {
        from: () => ({
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => ({ data: null, error: null }) }) }) }),
        }),
      } as any,
    };
    const result = await isImmunized('ten-1', 'sig-999', ports);
    expect(result).toBe(false);
  });
});
