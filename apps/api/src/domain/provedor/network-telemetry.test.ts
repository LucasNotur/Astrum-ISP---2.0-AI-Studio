import { describe, it, expect } from 'vitest';
import { classifyOpticalSignal, detectDegradation, type OnuReading } from './network-telemetry';

const onu = (over: Partial<OnuReading> = {}): OnuReading => ({
  customerId: 'c1', region: 'CTO-A', rxPowerDbm: -20, status: 'online', ...over,
});

describe('classifyOpticalSignal', () => {
  it('sinal bom (>= -25 dBm)', () => {
    expect(classifyOpticalSignal(onu({ rxPowerDbm: -20 }))).toBe('good');
  });
  it('atenção (-25 a -27)', () => {
    expect(classifyOpticalSignal(onu({ rxPowerDbm: -26 }))).toBe('warning');
  });
  it('crítico (< -27)', () => {
    expect(classifyOpticalSignal(onu({ rxPowerDbm: -29 }))).toBe('critical');
  });
  it('LOS/offline → down', () => {
    expect(classifyOpticalSignal(onu({ status: 'los' }))).toBe('down');
    expect(classifyOpticalSignal(onu({ status: 'offline' }))).toBe('down');
  });
});

describe('detectDegradation (alerta proativo)', () => {
  it('alerta crítico quando >=30% das ONUs de uma região caíram', () => {
    const readings = [
      onu({ customerId: 'a', status: 'los' }),
      onu({ customerId: 'b', status: 'los' }),
      onu({ customerId: 'c' }),
      onu({ customerId: 'd' }),
    ];
    const alerts = detectDegradation(readings);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts[0].affectedCustomers).toEqual(['a', 'b']);
  });

  it('não alerta se degradação abaixo do limiar', () => {
    const readings = [onu({ customerId: 'a', status: 'los' }), ...Array.from({ length: 9 }, (_, i) => onu({ customerId: `ok${i}` }))];
    expect(detectDegradation(readings)).toHaveLength(0);
  });

  it('warning (não critical) quando degradação é só sinal fraco, sem down', () => {
    const readings = [onu({ customerId: 'a', rxPowerDbm: -29 }), onu({ customerId: 'b', rxPowerDbm: -28 })];
    const alerts = detectDegradation(readings);
    expect(alerts[0].severity).toBe('warning');
  });
});
