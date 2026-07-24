import { describe, it, expect, vi } from 'vitest';
import {
  findConnectionForPhone, getConnectionHealth, isStale,
  sendViaAvailableConnection, WhatsAppConnection, MultiConnPorts,
} from './multi-connection.service';

const CONNS: WhatsAppConnection[] = [
  { id: 'c1', tenantId: 't1', instanceName: 'Zap SP', phoneNumber: '+5511999990001', status: 'connected', isPrimary: true, lastSeenAt: new Date().toISOString() },
  { id: 'c2', tenantId: 't1', instanceName: 'Zap RJ', phoneNumber: '+5521888880001', status: 'connected', isPrimary: false, lastSeenAt: new Date().toISOString() },
  { id: 'c3', tenantId: 't1', instanceName: 'Zap MG', phoneNumber: '+5531777770001', status: 'disconnected', isPrimary: false },
];

function makePorts(): MultiConnPorts {
  return {
    listConnections: vi.fn().mockResolvedValue(CONNS),
    getConnection: vi.fn().mockResolvedValue(CONNS[0]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    routeMessage: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
  };
}

describe('multi-connection.service', () => {
  describe('findConnectionForPhone', () => {
    it('roteia por DDD quando possível', () => {
      const conn = findConnectionForPhone(CONNS, '21999887766');
      expect(conn?.id).toBe('c2');
    });

    it('usa primária quando DDD não bate', () => {
      const conn = findConnectionForPhone(CONNS, '62999887766');
      expect(conn?.id).toBe('c1');
    });

    it('retorna null sem conexões healthy', () => {
      const unhealthy = CONNS.map((c) => ({ ...c, status: 'disconnected' as const }));
      expect(findConnectionForPhone(unhealthy, '11999')).toBeNull();
    });
  });

  describe('getConnectionHealth', () => {
    it('calcula saúde das conexões', () => {
      const health = getConnectionHealth(CONNS);
      expect(health.total).toBe(3);
      expect(health.connected).toBe(2);
      expect(health.disconnected).toBe(1);
      expect(health.healthPercent).toBe(67);
    });

    it('retorna 0% sem conexões', () => {
      expect(getConnectionHealth([]).healthPercent).toBe(0);
    });
  });

  describe('isStale', () => {
    it('conexão recente não é stale', () => {
      expect(isStale(CONNS[0], 5)).toBe(false);
    });

    it('conexão sem lastSeenAt é stale', () => {
      expect(isStale({ ...CONNS[0], lastSeenAt: undefined }, 5)).toBe(true);
    });

    it('conexão antiga é stale', () => {
      const old = { ...CONNS[0], lastSeenAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() };
      expect(isStale(old, 5)).toBe(true);
    });
  });

  describe('sendViaAvailableConnection', () => {
    it('envia pela conexão com DDD matching', async () => {
      const ports = makePorts();
      const result = await sendViaAvailableConnection('t1', '21999001122', 'Olá', ports);
      expect(result.ok).toBe(true);
      expect(result.connectionId).toBe('c2');
    });

    it('faz failover para outra conexão', async () => {
      const ports = makePorts();
      (ports.routeMessage as any)
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({ messageId: 'msg-fallback' });
      const result = await sendViaAvailableConnection('t1', '11999001122', 'Olá', ports);
      expect(result.ok).toBe(true);
      expect(result.connectionId).toBe('c2');
      expect(ports.updateStatus).toHaveBeenCalledWith('c1', 'error', 'Timeout');
    });

    it('falha quando nenhuma conexão disponível', async () => {
      const ports = makePorts();
      (ports.listConnections as any).mockResolvedValue([{ ...CONNS[2] }]);
      const result = await sendViaAvailableConnection('t1', '11999', 'Olá', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Nenhuma conexão');
    });
  });
});
