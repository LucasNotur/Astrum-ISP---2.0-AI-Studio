import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TechnicianApp, Storage, Api, DevicePermissions } from '../../../src/lib/technicianApp';

describe('Technician App Tests', () => {
  let mockStorage: import('vitest').Mocked<Storage>;
  let mockApi: import('vitest').Mocked<Api>;
  let isOnlineMock: import('vitest').Mock;
  let app: TechnicianApp;

  beforeEach(() => {
    vi.clearAllMocks();
    
    const localStore = new Map<string, any>();

    mockStorage = {
      saveLocal: vi.fn().mockImplementation(async (k, v) => { localStore.set(k, v); }),
      getLocal: vi.fn().mockImplementation(async (k) => localStore.get(k)),
      removeLocal: vi.fn().mockImplementation(async (k) => { localStore.delete(k); }),
      getAllKeys: vi.fn().mockImplementation(async () => Array.from(localStore.keys())),
    };

    mockApi = {
      syncCheckin: vi.fn().mockResolvedValue(undefined),
      generatePdf: vi.fn(),
    };

    isOnlineMock = vi.fn().mockReturnValue(true);

    app = new TechnicianApp(mockStorage, mockApi, isOnlineMock);
  });

  it('1. Check-in sem permissão de GPS -> deve falhar com mensagem clara (não travar silenciosamente)', async () => {
    const perms: DevicePermissions = { gps: false, camera: true };
    const res = await app.checkIn('os-1', perms);
    
    expect(res.success).toBe(false);
    expect(res.error).toBe('GPS permission is required for check-in.');
  });

  it('2. Check-in sem permissão de câmera -> registra com GPS apenas, flag checkin_photo_skipped=true', async () => {
    const perms: DevicePermissions = { gps: true, camera: false };
    const res = await app.checkIn('os-2', perms, { lat: 10, lng: 20 });
    
    expect(res.success).toBe(true);
    expect(res.checkin_photo_skipped).toBe(true);
    expect(mockApi.syncCheckin).toHaveBeenCalledWith('os-2', expect.objectContaining({
      checkin_photo_skipped: true,
      location: { lat: 10, lng: 20 }
    }));
  });

  it('3. Check-out sem check-in anterior -> bloqueado com mensagem de erro', async () => {
    const res = await app.checkOut('os-3');
    
    expect(res.success).toBe(false);
    expect(res.error).toBe('Cannot check-out without a previous check-in.');
  });

  it('4. Assinatura digital -> PDF gerado contém campo signature_url não nulo na OS', async () => {
    mockApi.generatePdf.mockResolvedValue({ id: 'os-4', status: 'completed', signature_url: 'https://sig.url/123' });
    
    const pdf = await app.signOS('os-4', 'data:image/png;base64,123');
    expect(pdf.signature_url).not.toBeNull();
    expect(pdf.signature_url).toBe('https://sig.url/123');
  });

  it('5. Otimização de rota com 3 endereços -> retorna sequência que minimiza distância (não ordem original)', () => {
    const addresses = [
      { id: 'far', location: { lat: 100, lng: 100 } },
      { id: 'near', location: { lat: 10, lng: 10 } },
      { id: 'mid', location: { lat: 50, lng: 50 } },
    ];
    
    const optimized = app.optimizeRoute(addresses);
    
    expect(optimized[0].id).toBe('near');
    expect(optimized[1].id).toBe('mid');
    expect(optimized[2].id).toBe('far');
  });

  it('6. Service Worker -> rota /api/* não é cacheada (network-first obrigatório)', () => {
    const apiStrategy = app.getServiceWorkerStrategy('/api/customers/1');
    const staticStrategy = app.getServiceWorkerStrategy('/assets/logo.png');
    
    expect(apiStrategy).toBe('network-first');
    expect(staticStrategy).toBe('cache-first');
  });

  it('7. PWA offline -> check-in salvo localmente e sincronizado ao reconectar', async () => {
    isOnlineMock.mockReturnValue(false);
    
    await app.checkIn('os-off', { gps: true, camera: true }, { lat: -23, lng: -46 });
    expect(mockApi.syncCheckin).not.toHaveBeenCalled();
    expect(mockStorage.saveLocal).toHaveBeenCalledWith('pending_checkin_os-off', expect.any(Object));

    isOnlineMock.mockReturnValue(true);
    await app.syncOfflineData();
    
    expect(mockApi.syncCheckin).toHaveBeenCalledTimes(1);
    expect(mockApi.syncCheckin).toHaveBeenCalledWith('os-off', expect.any(Object));
    expect(mockStorage.removeLocal).toHaveBeenCalledWith('pending_checkin_os-off');
  });
});
