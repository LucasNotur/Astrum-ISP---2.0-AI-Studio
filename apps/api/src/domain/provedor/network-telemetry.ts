/**
 * Network Telemetry — interpreta métricas de rede (ONU/OLT via SNMP/TR-069) e gera
 * alertas proativos de degradação. Plano Mestre V2, S93 (módulo novo). Puro.
 *
 * Transforma a Astrum de reativa ("minha internet caiu") em proativa ("detectamos
 * degradação na sua região, técnico acionado"). Liga na detecção de crise (S92).
 */

export interface OnuReading {
  customerId: string;
  region: string;
  rxPowerDbm: number;   // potência óptica recebida (dBm); típico -8 a -27
  status: 'online' | 'offline' | 'los'; // LOS = Loss of Signal
}

export type SignalHealth = 'good' | 'warning' | 'critical' | 'down';

/**
 * Classifica a saúde do sinal óptico. Faixas padrão GPON:
 *  >= -25 dBm ok; -25 a -27 atenção; < -27 crítico; offline/LOS = down.
 */
export function classifyOpticalSignal(r: OnuReading): SignalHealth {
  if (r.status === 'offline' || r.status === 'los') return 'down';
  if (r.rxPowerDbm >= -25) return 'good';
  if (r.rxPowerDbm >= -27) return 'warning';
  return 'critical';
}

export interface ProactiveAlert {
  region: string;
  severity: 'warning' | 'critical';
  affectedCustomers: string[];
  reason: string;
}

/**
 * Gera alertas proativos por região: se uma fração relevante das ONUs de uma região
 * está degradada/down, provavelmente é a rede (não o cliente) → alertar antes da reclamação.
 */
export function detectDegradation(
  readings: OnuReading[],
  minAffectedRatio = 0.3,
): ProactiveAlert[] {
  const byRegion = new Map<string, OnuReading[]>();
  for (const r of readings) {
    const arr = byRegion.get(r.region) ?? [];
    arr.push(r);
    byRegion.set(r.region, arr);
  }

  const alerts: ProactiveAlert[] = [];
  for (const [region, arr] of byRegion) {
    const bad = arr.filter((r) => {
      const h = classifyOpticalSignal(r);
      return h === 'critical' || h === 'down';
    });
    if (arr.length > 0 && bad.length / arr.length >= minAffectedRatio) {
      const hasDown = bad.some((r) => classifyOpticalSignal(r) === 'down');
      alerts.push({
        region,
        severity: hasDown ? 'critical' : 'warning',
        affectedCustomers: bad.map((r) => r.customerId),
        reason: `${bad.length}/${arr.length} ONUs degradadas na região`,
      });
    }
  }
  return alerts;
}
