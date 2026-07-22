/**
 * Dossiê #58 — Múltiplas Conexões/Zaps na mesma interface.
 * Gerencia múltiplas instâncias WhatsApp (Zaps) por tenant,
 * roteamento de mensagens por número, health check e failover.
 */

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error' | 'banned';

export interface WhatsAppConnection {
  id: string;
  tenantId: string;
  instanceName: string;
  phoneNumber: string;
  status: ConnectionStatus;
  queueId?: string;
  isPrimary: boolean;
  lastSeenAt?: string;
  errorMessage?: string;
}

export interface MultiConnPorts {
  listConnections: (tenantId: string) => Promise<WhatsAppConnection[]>;
  getConnection: (tenantId: string, connectionId: string) => Promise<WhatsAppConnection | null>;
  updateStatus: (connectionId: string, status: ConnectionStatus, error?: string) => Promise<void>;
  routeMessage: (connectionId: string, phone: string, message: string) => Promise<{ messageId: string }>;
}

export function findConnectionForPhone(connections: WhatsAppConnection[], targetPhone: string): WhatsAppConnection | null {
  const healthy = connections.filter((c) => c.status === 'connected');
  if (healthy.length === 0) return null;

  const dddMatch = healthy.find((c) => {
    const connDdd = c.phoneNumber.replace(/\D/g, '').slice(2, 4);
    const targetDdd = targetPhone.replace(/\D/g, '').slice(0, 2);
    return connDdd === targetDdd;
  });
  if (dddMatch) return dddMatch;

  const primary = healthy.find((c) => c.isPrimary);
  return primary ?? healthy[0];
}

export function getConnectionHealth(connections: WhatsAppConnection[]): {
  total: number; connected: number; disconnected: number; error: number; healthPercent: number;
} {
  const connected = connections.filter((c) => c.status === 'connected').length;
  const disconnected = connections.filter((c) => c.status === 'disconnected' || c.status === 'connecting').length;
  const error = connections.filter((c) => c.status === 'error' || c.status === 'banned').length;

  return {
    total: connections.length,
    connected,
    disconnected,
    error,
    healthPercent: connections.length > 0 ? Math.round((connected / connections.length) * 100) : 0,
  };
}

export function isStale(connection: WhatsAppConnection, staleMinutes: number): boolean {
  if (!connection.lastSeenAt) return true;
  const elapsed = (Date.now() - new Date(connection.lastSeenAt).getTime()) / (1000 * 60);
  return elapsed > staleMinutes;
}

export async function sendViaAvailableConnection(
  tenantId: string,
  targetPhone: string,
  message: string,
  ports: MultiConnPorts,
): Promise<{ ok: boolean; messageId?: string; connectionId?: string; error?: string }> {
  const connections = await ports.listConnections(tenantId);
  const conn = findConnectionForPhone(connections, targetPhone);

  if (!conn) return { ok: false, error: 'Nenhuma conexão WhatsApp disponível' };

  try {
    const { messageId } = await ports.routeMessage(conn.id, targetPhone, message);
    return { ok: true, messageId, connectionId: conn.id };
  } catch (err) {
    await ports.updateStatus(conn.id, 'error', (err as Error).message);

    const fallback = connections.find((c) => c.status === 'connected' && c.id !== conn.id);
    if (fallback) {
      try {
        const { messageId } = await ports.routeMessage(fallback.id, targetPhone, message);
        return { ok: true, messageId, connectionId: fallback.id };
      } catch {
        return { ok: false, error: 'Falha em todas as conexões disponíveis' };
      }
    }

    return { ok: false, error: (err as Error).message };
  }
}
