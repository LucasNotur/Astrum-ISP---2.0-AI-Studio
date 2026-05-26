import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendEmail = vi.fn();
const mockFetchBatteryInfo = vi.fn();

let lastAlerts: Record<string, number> = {};

async function monitorBattery(instanceId: string, adminEmail: string, currentTime: number = Date.now()) {
  try {
    const batteryInfo = await mockFetchBatteryInfo(instanceId);
    
    if (batteryInfo.level < 20 && !batteryInfo.isCharging) {
      const lastAlertTime = lastAlerts[instanceId] || 0;
      const oneHourMs = 60 * 60 * 1000;
      
      // Check if we already sent an alert in the last hour
      if (currentTime - lastAlertTime > oneHourMs) {
        await mockSendEmail(adminEmail, `ALERTA: Bateria do WhatsApp da instância ${instanceId} está em ${batteryInfo.level}%`);
        lastAlerts[instanceId] = currentTime;
      }
    }
    
    return { success: true };
  } catch (error) {
    // API off/unavailable -> don't crash
    return { success: true, reason: 'api_unavailable' };
  }
}

describe('Testes de Bateria WhatsApp (Battery Monitor)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    lastAlerts = {};
  });

  it('1. battery.level < 20 E NOT isCharging → envia email de alerta ao admin do ISP', async () => {
    mockFetchBatteryInfo.mockResolvedValue({ level: 15, isCharging: false });
    
    await monitorBattery('inst1', 'admin@isp.com');
    
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith('admin@isp.com', expect.stringContaining('15%'));
  });

  it('2. battery.level < 20 MAS isCharging → NÃO envia alerta', async () => {
    mockFetchBatteryInfo.mockResolvedValue({ level: 15, isCharging: true });
    
    await monitorBattery('inst1', 'admin@isp.com');
    
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('3. battery.level >= 20 → NÃO envia alerta', async () => {
    mockFetchBatteryInfo.mockResolvedValue({ level: 25, isCharging: false });
    
    await monitorBattery('inst1', 'admin@isp.com');
    
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('4. API da instância indisponível no check → job finaliza sem erro', async () => {
    mockFetchBatteryInfo.mockRejectedValue(new Error('Connection timeout'));
    
    const result = await monitorBattery('inst1', 'admin@isp.com');
    
    expect(result.success).toBe(true);
    expect(result.reason).toBe('api_unavailable');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('5. Alerta enviado → não reenvia em menos de 1 hora (evita spam)', async () => {
    mockFetchBatteryInfo.mockResolvedValue({ level: 10, isCharging: false });
    
    const baseTime = 1600000000000;
    
    // First run - sends email
    await monitorBattery('inst1', 'admin@isp.com', baseTime);
    
    // Second run, 30 min later - does NOT send
    await monitorBattery('inst1', 'admin@isp.com', baseTime + 30 * 60 * 1000);
    
    // Third run, 61 min later - sends email again
    await monitorBattery('inst1', 'admin@isp.com', baseTime + 61 * 60 * 1000);
    
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

});
