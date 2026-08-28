import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  tenantsResult: { data: [] as any[], error: null as any },
  insertResult: { error: null as any },
}));

vi.mock('../database/supabase.client', () => {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => Promise.resolve(h.tenantsResult)),
    insert: vi.fn(() => Promise.resolve(h.insertResult)),
  };
  const supabaseAdmin = { from: vi.fn(() => builder) };
  return { supabaseAdmin };
});

vi.mock('../../../../../packages/queue/src/queues', () => ({
  messageQueue: { add: vi.fn().mockResolvedValue({ id: 'job-1' }) },
}));

vi.mock('../cache/redis.client', () => ({
  redis: { lpop: vi.fn() },
}));

vi.mock('./sentry.service', () => ({
  captureWarning: vi.fn(),
}));

vi.mock('../logging/logger', () => ({
  infraLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { syntheticMonitorPorts } from './synthetic-monitor.ports';
import { supabaseAdmin } from '../database/supabase.client';
import { messageQueue } from '../../../../../packages/queue/src/queues';
import { redis } from '../cache/redis.client';
import { captureWarning } from './sentry.service';

describe('syntheticMonitorPorts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.tenantsResult = { data: [], error: null };
    h.insertResult = { error: null };
  });

  describe('listPilotTenants', () => {
    it('devolve os tenants com is_sandbox=true', async () => {
      h.tenantsResult = { data: [{ id: 't-1', name: 'ISP Demo' }], error: null };
      const tenants = await syntheticMonitorPorts.listPilotTenants();
      expect(tenants).toEqual([{ id: 't-1', name: 'ISP Demo' }]);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('tenants');
    });

    it('erro do Supabase propaga', async () => {
      h.tenantsResult = { data: null, error: new Error('conexão falhou') };
      await expect(syntheticMonitorPorts.listPilotTenants()).rejects.toThrow('conexão falhou');
    });
  });

  describe('sendSyntheticMessage', () => {
    it('enfileira na fila real e devolve a resposta do Redis', async () => {
      (redis.lpop as any).mockResolvedValueOnce('Resposta sintética do agente');

      const result = await syntheticMonitorPorts.sendSyntheticMessage('t-1', 'Qual o horário de atendimento?');

      expect(result.response).toBe('Resposta sintética do agente');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(messageQueue.add).toHaveBeenCalledWith(
        'inbound',
        expect.objectContaining({
          tenantId: 't-1',
          messageContent: 'Qual o horário de atendimento?',
          channel: 'webchat',
        }),
        expect.objectContaining({ jobId: expect.stringMatching(/^synthetic-probe:/) }),
      );
    });

    it('sem resposta -> lança erro (timeout)', async () => {
      (redis.lpop as any).mockResolvedValue(null);
      await expect(
        syntheticMonitorPorts.sendSyntheticMessage('t-1', 'oi'),
      ).rejects.toThrow(/sem resposta/i);
    }, 20000);
  });

  describe('recordProbeResult', () => {
    it('grava na tabela synthetic_probe_results', async () => {
      await syntheticMonitorPorts.recordProbeResult({
        tenantId: 't-1',
        timestamp: '2026-08-28T12:00:00.000Z',
        success: true,
        latencyMs: 1200,
        response: 'ok',
      });
      expect(supabaseAdmin.from).toHaveBeenCalledWith('synthetic_probe_results');
    });

    it('erro do Supabase não lança (não pode derrubar o worker)', async () => {
      h.insertResult = { error: new Error('insert falhou') };
      await expect(
        syntheticMonitorPorts.recordProbeResult({
          tenantId: 't-1',
          timestamp: '2026-08-28T12:00:00.000Z',
          success: false,
          latencyMs: -1,
          error: 'boom',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('alertOnFailure', () => {
    it('chama captureWarning com o contexto', async () => {
      await syntheticMonitorPorts.alertOnFailure('t-1', 'Sonda falhou: timeout');
      expect(captureWarning).toHaveBeenCalledWith(
        expect.stringContaining('t-1'),
        expect.objectContaining({ source: 'synthetic-monitor', tenantId: 't-1' }),
      );
    });
  });
});
