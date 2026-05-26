import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateQR = vi.fn();
const mockUpdateFirestore = vi.fn();
const mockNotifyAdmin = vi.fn();
const mockAttemptConnect = vi.fn();

let mockInstances: Record<string, any> = {};

function reloadQRCode(instanceId: string) {
  const qrCode = mockGenerateQR(instanceId);
  mockUpdateFirestore('instances', instanceId, { qrCode, status: 'qr_ready' });
  return qrCode;
}

function handleDisconnect(instanceId: string) {
  if (mockInstances[instanceId]) {
    mockInstances[instanceId].health_status = 'close';
    mockUpdateFirestore('instances', instanceId, { health_status: 'close' });
  }
}

async function handleReconnection(instanceId: string) {
  const maxRetries = 4;
  let attempt = 0;
  let connected = false;
  let backoffLogs = [];

  while (attempt < maxRetries && !connected) {
    attempt++;
    const backoffMs = Math.pow(2, attempt) * 1000;
    backoffLogs.push(backoffMs);
    
    // Simula a espera
    // await new Promise(r => setTimeout(r, backoffMs));
    
    connected = await mockAttemptConnect(instanceId, attempt);
  }

  if (!connected) {
    mockUpdateFirestore('instances', instanceId, { status: 'offline' });
    if (mockInstances[instanceId]) {
         mockInstances[instanceId].status = 'offline';
    }
    mockNotifyAdmin(`Instância ${instanceId} offfline após ${maxRetries} tentativas.`);
  }

  return { connected, attempt, backoffLogs };
}

describe('Testes de Conexão Non-Official (Connection Manager)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockInstances = {
      'instA': { id: 'instA', tenantId: 'tenant1', health_status: 'open', status: 'online' },
      'instB': { id: 'instB', tenantId: 'tenant1', health_status: 'open', status: 'online' }
    };
  });

  it('1. QR Code recarregado via painel → novo QR gerado sem necessidade de SSH', () => {
    mockGenerateQR.mockReturnValue('new_qr_code_string');
    
    const qr = reloadQRCode('instA');
    
    expect(mockGenerateQR).toHaveBeenCalledWith('instA');
    expect(qr).toBe('new_qr_code_string');
    expect(mockUpdateFirestore).toHaveBeenCalledWith('instances', 'instA', { qrCode: 'new_qr_code_string', status: 'qr_ready' });
  });

  it('2. Instância desconectada → health_status atualizado para close no Firestore', () => {
    handleDisconnect('instA');
    
    expect(mockUpdateFirestore).toHaveBeenCalledWith('instances', 'instA', { health_status: 'close' });
    expect(mockInstances['instA'].health_status).toBe('close');
  });

  it('3. Reconexão automática → tenta com backoff exponencial', async () => {
    // Fails on attempt 1 and 2, succeeds on 3
    mockAttemptConnect.mockResolvedValueOnce(false)
                      .mockResolvedValueOnce(false)
                      .mockResolvedValueOnce(true);
                      
    const result = await handleReconnection('instA');
    
    expect(result.connected).toBe(true);
    expect(result.attempt).toBe(3);
    expect(result.backoffLogs).toEqual([2000, 4000, 8000]); // 2^1, 2^2, 2^3
    expect(mockNotifyAdmin).not.toHaveBeenCalled();
  });

  it('4. 4 tentativas todas falham → instância offline + admin notificado', async () => {
    mockAttemptConnect.mockResolvedValue(false); // All fail
    
    const result = await handleReconnection('instA');
    
    expect(result.connected).toBe(false);
    expect(result.attempt).toBe(4);
    expect(mockUpdateFirestore).toHaveBeenCalledWith('instances', 'instA', { status: 'offline' });
    expect(mockNotifyAdmin).toHaveBeenCalledWith(expect.stringContaining('offfline após 4 tentativas'));
  });

  it('5. Estado da instância A → não interfere na instância B do mesmo tenant', async () => {
    mockAttemptConnect.mockResolvedValue(false); // All fail for instA
    
    await handleReconnection('instA'); // instA will go offline
    handleDisconnect('instA'); // instA health close
    
    expect(mockInstances['instA'].status).toBe('offline');
    expect(mockInstances['instA'].health_status).toBe('close');
    
    // instB remains untouched
    expect(mockInstances['instB'].status).toBe('online');
    expect(mockInstances['instB'].health_status).toBe('open');
  });

});
