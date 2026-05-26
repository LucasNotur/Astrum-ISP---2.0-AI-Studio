import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQueueMessage = vi.fn();
const mockFetchWeather = vi.fn();

let mockTenants: Record<string, any> = {};
let mockOSAndClients: any[] = [];
let sentAlertsTracker: Set<string> = new Set(); // to simulate idempotency

async function checkWeatherAndAlert(tenantId: string, dateStr: string) {
  const tenant = mockTenants[tenantId];
  if (!tenant || !tenant.location || !tenant.location.lat || !tenant.location.lon) {
    return { success: true, reason: 'no_location_configured' }; // Silently ignore if no coordinates
  }

  try {
    const weatherData = await mockFetchWeather(tenant.location.lat, tenant.location.lon, dateStr);
    
    if (weatherData.rainProb > 70) {
      // Find all OS for this date
      const osList = mockOSAndClients.filter(os => os.tenantId === tenantId && os.date === dateStr);
      
      for (const os of osList) {
        // Prevent duplicate alerts
        const alertId = `${os.id}-${dateStr}-rain`;
        if (!sentAlertsTracker.has(alertId)) {
          mockQueueMessage(os.clientId, `Previsão de chuva para ${dateStr}. O técnico pode atrasar ou remarcar.`);
          sentAlertsTracker.add(alertId);
        }
      }
    }
    
    return { success: true };

  } catch (error) {
    // API Unavailable, do not crash
    return { success: false, reason: 'api_error' };
  }
}

describe('Testes do Alerta de Chuva (Weather Alert)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    sentAlertsTracker.clear();
    mockTenants = {
      'tenantA': { location: { lat: -23.5, lon: -46.6 } },
      'tenantB': { location: null } // No coordinates
    };
    mockOSAndClients = [
         { id: 'os1', tenantId: 'tenantA', clientId: 'client1', date: '2023-11-20' },
         { id: 'os2', tenantId: 'tenantA', clientId: 'client2', date: '2023-11-21' }
    ];
  });

  it('1. Probabilidade de chuva > 70% → enfileira mensagens para clientes com OS no período', async () => {
    mockFetchWeather.mockResolvedValue({ rainProb: 80 });
    
    await checkWeatherAndAlert('tenantA', '2023-11-20');
    
    expect(mockQueueMessage).toHaveBeenCalledTimes(1);
    expect(mockQueueMessage).toHaveBeenCalledWith('client1', expect.any(String));
  });

  it('2. Probabilidade <= 70% → NÃO enfileira mensagens', async () => {
    mockFetchWeather.mockResolvedValue({ rainProb: 60 });
    
    await checkWeatherAndAlert('tenantA', '2023-11-20');
    
    expect(mockQueueMessage).not.toHaveBeenCalled();
  });

  it('3. Open-Meteo API indisponível → job finaliza sem erro (não crasha o worker)', async () => {
    mockFetchWeather.mockRejectedValue(new Error('Network Error'));
    
    const result = await checkWeatherAndAlert('tenantA', '2023-11-20');
    
    expect(result.success).toBe(false);
    expect(result.reason).toBe('api_error'); // Handled gracefully
  });

  it('4. Tenant sem coordenadas configuradas → ignorado silenciosamente', async () => {
    const result = await checkWeatherAndAlert('tenantB', '2023-11-20');
    
    expect(result.success).toBe(true);
    expect(result.reason).toBe('no_location_configured');
    expect(mockFetchWeather).not.toHaveBeenCalled();
  });

  it('5. Cliente sem OS agendada no período → NÃO recebe mensagem', async () => {
    mockFetchWeather.mockResolvedValue({ rainProb: 90 });
    
    await checkWeatherAndAlert('tenantA', '2023-12-01'); // No OS on this date
    
    expect(mockQueueMessage).not.toHaveBeenCalled();
  });

  it('6. Mesma previsão processada 2x → mensagem enviada apenas 1 vez (idempotência)', async () => {
    mockFetchWeather.mockResolvedValue({ rainProb: 95 });
    
    await checkWeatherAndAlert('tenantA', '2023-11-20'); // Run 1
    await checkWeatherAndAlert('tenantA', '2023-11-20'); // Run 2
    
    expect(mockQueueMessage).toHaveBeenCalledTimes(1); // Only queued once
  });

});
