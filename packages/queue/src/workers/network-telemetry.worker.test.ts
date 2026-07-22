import { describe, it, expect, vi } from 'vitest';
import { processTelemetryJob, type TelemetryWorkerPorts } from './network-telemetry.worker';
import type { OnuReading } from '../../../../apps/api/src/domain/provedor/network-telemetry';

const NOW = 1_000_000_000_000;

function makePorts(overrides: Partial<TelemetryWorkerPorts> = {}): TelemetryWorkerPorts {
  return {
    listPilotOlts: vi.fn().mockResolvedValue([
      { id: 'olt-1', host: '10.0.0.1', community: 'public', region: 'CTO-Centro' },
    ]),
    pollOnuReadings: vi.fn().mockResolvedValue([]),
    storeReadings: vi.fn().mockResolvedValue(undefined),
    sendProactiveAlert: vi.fn().mockResolvedValue(undefined),
    hasRecentAlert: vi.fn().mockResolvedValue(false),
    escalateToCrisis: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function onuReadings(region: string, count: number, degradedCount: number): OnuReading[] {
  const readings: OnuReading[] = [];
  for (let i = 0; i < count; i++) {
    const isDegraded = i < degradedCount;
    readings.push({
      customerId: `c-${i}`,
      region,
      rxPowerDbm: isDegraded ? -30 : -20,
      status: isDegraded ? 'los' : 'online',
    });
  }
  return readings;
}

describe('network-telemetry.worker — processTelemetryJob', () => {
  it('alerta proativo disparado por degradação simulada ANTES do cliente reclamar', async () => {
    const readings = onuReadings('CTO-Centro', 10, 5);
    const ports = makePorts({
      pollOnuReadings: vi.fn().mockResolvedValue(readings),
    });

    const result = await processTelemetryJob(ports, NOW);

    expect(result.alertsFired).toBe(1);
    expect(result.readingsStored).toBe(10);
    expect(ports.sendProactiveAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'CTO-Centro',
        severity: 'critical',
        affectedCustomers: expect.arrayContaining(['c-0', 'c-4']),
      }),
    );
  });

  it('escala para crise quando severidade é critical', async () => {
    const readings = onuReadings('CTO-Norte', 6, 3);
    const ports = makePorts({
      pollOnuReadings: vi.fn().mockResolvedValue(readings),
    });

    await processTelemetryJob(ports, NOW);

    expect(ports.escalateToCrisis).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical', region: 'CTO-Norte' }),
    );
  });

  it('não dispara alerta duplicado se já enviou recentemente', async () => {
    const readings = onuReadings('CTO-Sul', 10, 5);
    const ports = makePorts({
      pollOnuReadings: vi.fn().mockResolvedValue(readings),
      hasRecentAlert: vi.fn().mockResolvedValue(true),
    });

    const result = await processTelemetryJob(ports, NOW);

    expect(result.alertsFired).toBe(0);
    expect(ports.sendProactiveAlert).not.toHaveBeenCalled();
  });

  it('rede saudável → nenhum alerta', async () => {
    const readings = onuReadings('CTO-Leste', 10, 0);
    const ports = makePorts({
      pollOnuReadings: vi.fn().mockResolvedValue(readings),
    });

    const result = await processTelemetryJob(ports, NOW);

    expect(result.alertsFired).toBe(0);
    expect(result.readingsStored).toBe(10);
    expect(ports.sendProactiveAlert).not.toHaveBeenCalled();
  });

  it('OLT inacessível → continua para a próxima sem crashar', async () => {
    const ports = makePorts({
      listPilotOlts: vi.fn().mockResolvedValue([
        { id: 'olt-1', host: '10.0.0.1', community: 'public', region: 'CTO-A' },
        { id: 'olt-2', host: '10.0.0.2', community: 'public', region: 'CTO-B' },
      ]),
      pollOnuReadings: vi.fn()
        .mockRejectedValueOnce(new Error('SNMP timeout'))
        .mockResolvedValueOnce(onuReadings('CTO-B', 4, 0)),
    });

    const result = await processTelemetryJob(ports, NOW);

    expect(result.oltsPolled).toBe(2);
    expect(result.readingsStored).toBe(4);
  });

  it('nenhuma OLT piloto → retorno limpo', async () => {
    const ports = makePorts({
      listPilotOlts: vi.fn().mockResolvedValue([]),
    });

    const result = await processTelemetryJob(ports, NOW);

    expect(result.oltsPolled).toBe(0);
    expect(result.readingsStored).toBe(0);
    expect(result.alertsFired).toBe(0);
  });
});
