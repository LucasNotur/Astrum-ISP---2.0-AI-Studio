import { describe, it, expect, vi } from 'vitest';
import { processSyntheticMonitorJob, type SyntheticMonitorPorts } from './synthetic-monitor.worker';

function makePorts(overrides: Partial<SyntheticMonitorPorts> = {}): SyntheticMonitorPorts {
  return {
    listPilotTenants: vi.fn().mockResolvedValue([
      { id: 't1', name: 'ISP Alpha' },
      { id: 't2', name: 'ISP Beta' },
    ]),
    sendSyntheticMessage: vi.fn().mockResolvedValue({
      response: 'Olá! Nosso horário de atendimento é 24/7.',
      latencyMs: 800,
    }),
    recordProbeResult: vi.fn().mockResolvedValue(undefined),
    alertOnFailure: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('Synthetic Monitor Worker', () => {
  it('executa probe para cada tenant piloto', async () => {
    const ports = makePorts();
    const result = await processSyntheticMonitorJob(ports);

    expect(result.probes).toBe(2);
    expect(result.failures).toBe(0);
    expect(ports.sendSyntheticMessage).toHaveBeenCalledTimes(2);
    expect(ports.recordProbeResult).toHaveBeenCalledTimes(2);
    expect(ports.alertOnFailure).not.toHaveBeenCalled();
  });

  it('alerta quando latência excede limite', async () => {
    const ports = makePorts({
      sendSyntheticMessage: vi.fn().mockResolvedValue({
        response: 'ok',
        latencyMs: 8000,
      }),
    });

    const result = await processSyntheticMonitorJob(ports);

    expect(result.failures).toBe(2);
    expect(ports.alertOnFailure).toHaveBeenCalledTimes(2);
    expect(ports.alertOnFailure).toHaveBeenCalledWith('t1', expect.stringContaining('Latência'));
  });

  it('alerta quando sonda lança erro', async () => {
    const ports = makePorts({
      sendSyntheticMessage: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });

    const result = await processSyntheticMonitorJob(ports);

    expect(result.failures).toBe(2);
    expect(ports.alertOnFailure).toHaveBeenCalledWith('t1', expect.stringContaining('Connection refused'));
    expect(ports.recordProbeResult).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Connection refused' }),
    );
  });

  it('sem tenants piloto retorna 0 probes', async () => {
    const ports = makePorts({
      listPilotTenants: vi.fn().mockResolvedValue([]),
    });

    const result = await processSyntheticMonitorJob(ports);
    expect(result.probes).toBe(0);
    expect(result.failures).toBe(0);
  });
});
