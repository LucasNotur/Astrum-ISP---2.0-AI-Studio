import { describe, it, expect } from 'vitest';
import { evaluateProbe, computeIspHealth } from './health-score';

describe('evaluateProbe (sonda sintética)', () => {
  it('saudável quando o fluxo E2E completa dentro do SLA', () => {
    const r = evaluateProbe({ reachedLlm: true, reachedRag: true, sentWhatsapp: true, latencyMs: 2000 });
    expect(r.healthy).toBe(true);
  });

  it('acusa cada etapa que falhou', () => {
    const r = evaluateProbe({ reachedLlm: true, reachedRag: false, sentWhatsapp: false, latencyMs: 9000 });
    expect(r.healthy).toBe(false);
    expect(r.reasons).toEqual(expect.arrayContaining(['rag_unreachable', 'whatsapp_send_failed', 'latency_exceeded']));
  });
});

describe('computeIspHealth', () => {
  const healthy = { queueBacklog: 5, whatsappConnected: true, autonomousResolutionRate: 0.85, errorRate: 0.0, probeHealthy: true };

  it('ISP saudável → score alto, status healthy', () => {
    const r = computeIspHealth(healthy);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.status).toBe('healthy');
  });

  it('WhatsApp desconectado derruba para degraded/critical', () => {
    const r = computeIspHealth({ ...healthy, whatsappConnected: false });
    expect(r.status).not.toBe('healthy');
  });

  it('fila enorme + erros altos → critical', () => {
    const r = computeIspHealth({ ...healthy, queueBacklog: 500, errorRate: 0.5, probeHealthy: false });
    expect(r.status).toBe('critical');
    expect(r.score).toBeLessThan(50);
  });

  it('score fica no intervalo 0–100', () => {
    const worst = computeIspHealth({ queueBacklog: 9999, whatsappConnected: false, autonomousResolutionRate: 0, errorRate: 1, probeHealthy: false });
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(100);
  });
});
