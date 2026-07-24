import { describe, it, expect, vi } from 'vitest';
import { processCrisisJob, type CrisisWorkerPorts } from './crisis.worker';
import type { IncomingComplaint, CrisisConfig } from '../../../../apps/api/src/domain/atendimento/crisis-detector';

const NOW = 1_000_000_000_000;
const CONFIG: CrisisConfig = { windowMs: 5 * 60_000, minComplaints: 10 };

function makePorts(overrides: Partial<CrisisWorkerPorts> = {}): CrisisWorkerPorts {
  return {
    listActiveTenants: vi.fn().mockResolvedValue(['t1']),
    getRecentComplaints: vi.fn().mockResolvedValue([]),
    hasOpenIncident: vi.fn().mockResolvedValue(false),
    createIncident: vi.fn().mockImplementation((inc) =>
      Promise.resolve({ ...inc, id: 'inc-1' }),
    ),
    sendBulkResponse: vi.fn().mockImplementation((_tid, ids) =>
      Promise.resolve(ids.length),
    ),
    suppressSlaForCustomers: vi.fn().mockResolvedValue(undefined),
    suppressCobrancaForCustomers: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function generateComplaints(region: string, count: number): IncomingComplaint[] {
  return Array.from({ length: count }, (_, i) => ({
    customerId: `c-${i}`,
    region,
    timestamp: NOW - i * 1000,
  }));
}

describe('crisis.worker — processCrisisJob', () => {
  it('200 mensagens em 5min → 1 incidente criado, respostas agrupadas', async () => {
    const complaints = generateComplaints('CTO-Centro', 200);
    const ports = makePorts({
      getRecentComplaints: vi.fn().mockResolvedValue(complaints),
    });

    const result = await processCrisisJob(ports, CONFIG, NOW);

    expect(result.incidentsCreated).toBe(1);
    expect(result.messagessSent).toBe(200);
    expect(ports.createIncident).toHaveBeenCalledOnce();
    expect(ports.createIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        region: 'CTO-Centro',
        customerCount: 200,
        status: 'open',
      }),
    );
    expect(ports.sendBulkResponse).toHaveBeenCalledWith(
      't1',
      expect.arrayContaining(['c-0', 'c-199']),
      expect.stringContaining('instabilidade na região CTO-Centro'),
    );
    expect(ports.suppressSlaForCustomers).toHaveBeenCalledWith('t1', expect.any(Array));
    expect(ports.suppressCobrancaForCustomers).toHaveBeenCalledWith('t1', expect.any(Array));
  });

  it('abaixo do gatilho → nenhum incidente', async () => {
    const complaints = generateComplaints('CTO-Sul', 5);
    const ports = makePorts({
      getRecentComplaints: vi.fn().mockResolvedValue(complaints),
    });

    const result = await processCrisisJob(ports, CONFIG, NOW);

    expect(result.incidentsCreated).toBe(0);
    expect(result.messagessSent).toBe(0);
    expect(ports.createIncident).not.toHaveBeenCalled();
  });

  it('não duplica incidente se já existe um aberto na região', async () => {
    const complaints = generateComplaints('CTO-Norte', 50);
    const ports = makePorts({
      getRecentComplaints: vi.fn().mockResolvedValue(complaints),
      hasOpenIncident: vi.fn().mockResolvedValue(true),
    });

    const result = await processCrisisJob(ports, CONFIG, NOW);

    expect(result.incidentsCreated).toBe(0);
    expect(ports.createIncident).not.toHaveBeenCalled();
    expect(ports.sendBulkResponse).not.toHaveBeenCalled();
  });

  it('múltiplas regiões em crise → múltiplos incidentes', async () => {
    const complaints = [
      ...generateComplaints('CTO-A', 30),
      ...generateComplaints('CTO-B', 15).map((c) => ({ ...c, customerId: `b-${c.customerId}` })),
    ];
    const ports = makePorts({
      getRecentComplaints: vi.fn().mockResolvedValue(complaints),
    });

    const result = await processCrisisJob(ports, CONFIG, NOW);

    expect(result.incidentsCreated).toBe(2);
    expect(ports.createIncident).toHaveBeenCalledTimes(2);
  });

  it('nenhum tenant ativo → retorno limpo', async () => {
    const ports = makePorts({
      listActiveTenants: vi.fn().mockResolvedValue([]),
    });

    const result = await processCrisisJob(ports, CONFIG, NOW);

    expect(result.tenantsChecked).toBe(0);
    expect(result.incidentsCreated).toBe(0);
  });
});
