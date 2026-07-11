/**
 * S74 — Testes do shadow mode no message.worker.
 * Verifica que decideSend roteia corretamente para o processamento shadow
 * e que o shadow NUNCA envia para o canal real.
 */
import { describe, it, expect } from 'vitest';
import { decideSend } from '@/apps/api/src/domain/atendimento/shadow-mode';

describe('decideSend — roteamento shadow no worker', () => {
  it('job isShadow=true + engine legacy → recordShadow, nunca envia', () => {
    const d = decideSend({ isShadowRequest: true, engine: 'legacy' });
    expect(d.sendReal).toBe(false);
    expect(d.recordShadow).toBe(true);
  });

  it('job isShadow=false + engine legacy → recordShadow (motor novo em shadow durante período de observação)', () => {
    const d = decideSend({ isShadowRequest: false, engine: 'legacy' });
    expect(d.sendReal).toBe(false);
    expect(d.recordShadow).toBe(true);
  });

  it('job isShadow=false + engine v2 → envia de verdade (cutover realizado)', () => {
    const d = decideSend({ isShadowRequest: false, engine: 'v2' });
    expect(d.sendReal).toBe(true);
    expect(d.recordShadow).toBe(false);
  });

  it('nunca sendReal E recordShadow simultaneamente (garante zero resposta dupla)', () => {
    for (const engine of ['legacy', 'v2'] as const) {
      for (const isShadow of [true, false]) {
        const d = decideSend({ isShadowRequest: isShadow, engine });
        expect(d.sendReal && d.recordShadow).toBe(false);
      }
    }
  });

  it('job isShadow=true é o campo que chega quando o webhook legado espelha para v2', () => {
    // Simula: legado enviou x-shadow:true → v2 webhook criou job com isShadow:true
    const isShadowRequest = true;
    const d = decideSend({ isShadowRequest, engine: 'legacy' });
    // O motor NUNCA envia quando está em shadow mode
    expect(d.sendReal).toBe(false);
    expect(d.reason).toBe('legacy_ativa_motor_novo_em_shadow');
  });
});
