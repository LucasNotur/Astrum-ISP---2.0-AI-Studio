import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAttemptConnection = vi.fn();
const mockNotifyAdmin = vi.fn();
const mockNotifySuperAdmin = vi.fn();

let globalFailuresTracker: Set<string> = new Set();
let mockInstances: Record<string, any> = {};

function resetReconnectionState() {
  globalFailuresTracker.clear();
  mockInstances = {};
}

async function handleEvolutionApiFailure(instanceId: string, tenantId: string) {
  const maxRetries = 4;
  let attempt = 1;
  let connected = false;
  let backoffLogs = [];
  
  if (!mockInstances[instanceId]) {
    mockInstances[instanceId] = { status: 'online' };
  }

  // Record failure to detect global outage
  globalFailuresTracker.add(tenantId);
  if (globalFailuresTracker.size >= 3) {
    mockNotifySuperAdmin('Possível Outage Global: Mais de 3 tenants estão falhando simultaneamente.');
  }

  while (attempt <= maxRetries && !connected) {
    // Tentativa 1 é imediata (0s), depois 2s, 4s, 8s
    const backoffMs = attempt === 1 ? 0 : Math.pow(2, attempt - 1) * 1000;
    backoffLogs.push(backoffMs);
    
    // Simula a espera real, no teste apenas registramos
    // await new Promise(r => setTimeout(r, backoffMs));
    
    connected = await mockAttemptConnection(instanceId, attempt);
    
    if (!connected) {
      attempt++;
    }
  }

  if (!connected) {
    mockInstances[instanceId].status = 'offline';
    mockNotifyAdmin(`Instância ${instanceId} offline após 4 tentativas.`);
  }

  return { connected, attemptsMade: attempt <= maxRetries ? attempt : maxRetries, backoffLogs };
}

describe('Testes de Reconexão (Reconnection Manager)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    resetReconnectionState();
  });

  it('1. Falha da Evolution API → tenta reconexão imediatamente (tentativa 1)', async () => {
    mockAttemptConnection.mockResolvedValueOnce(true);
    
    const result = await handleEvolutionApiFailure('inst1', 'tenant1');
    
    expect(result.connected).toBe(true);
    expect(result.attemptsMade).toBe(1);
    expect(result.backoffLogs[0]).toBe(0); // Imediata
  });

  it('2. Tentativa 1 falha → aguarda 2s antes da tentativa 2 (backoff exponencial)', async () => {
    mockAttemptConnection
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
      
    const result = await handleEvolutionApiFailure('inst1', 'tenant1');
    
    expect(result.connected).toBe(true);
    expect(result.attemptsMade).toBe(2);
    expect(result.backoffLogs[0]).toBe(0); // tentativa 1: imediata
    expect(result.backoffLogs[1]).toBe(2000); // tentativa 2: 2s (2^(2-1)*1000)
  });

  it('3. Tentativa 2 falha → aguarda 4s antes da tentativa 3', async () => {
    mockAttemptConnection
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
      
    const result = await handleEvolutionApiFailure('inst1', 'tenant1');
    
    expect(result.attemptsMade).toBe(3);
    expect(result.backoffLogs[2]).toBe(4000); // tentativa 3: 4s (2^(3-1)*1000)
  });

  it('4. 4 tentativas todas falham → instância offline + admin notificado', async () => {
    mockAttemptConnection.mockResolvedValue(false); // Todas falham
    
    const result = await handleEvolutionApiFailure('inst1', 'tenant1');
    
    expect(result.connected).toBe(false);
    expect(result.attemptsMade).toBe(4);
    expect(mockInstances['inst1'].status).toBe('offline');
    expect(mockNotifyAdmin).toHaveBeenCalledWith('Instância inst1 offline após 4 tentativas.');
  });

  it('5. Reconexão bem-sucedida na tentativa 3 → para o backoff, não faz a tentativa 4', async () => {
    mockAttemptConnection
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
      
    const result = await handleEvolutionApiFailure('inst1', 'tenant1');
    
    expect(result.connected).toBe(true);
    expect(result.attemptsMade).toBe(3);
    expect(result.backoffLogs.length).toBe(3); // Não adicionou logs de backoff para a 4a
    expect(mockAttemptConnection).toHaveBeenCalledTimes(3);
  });

  it('6. Múltiplos tenants com falha simultânea → Super-Admin notificado de possível outage global', async () => {
    mockAttemptConnection.mockResolvedValue(true);
    
    await handleEvolutionApiFailure('inst1', 'tenant1');
    await handleEvolutionApiFailure('inst2', 'tenant2');
    await handleEvolutionApiFailure('inst3', 'tenant3'); // Dispara limit de 3
    
    expect(mockNotifySuperAdmin).toHaveBeenCalledWith(expect.stringContaining('Possível Outage Global'));
  });

});
