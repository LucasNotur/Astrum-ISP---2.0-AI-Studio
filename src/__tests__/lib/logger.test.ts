import { describe, it, expect, vi, afterEach } from 'vitest';
import { redactPII, logger } from '../../lib/logger.ts';

describe('logger redactPII (OBS-06)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('redige chaves sensíveis (cpf, telefone, email, token, conteúdo)', () => {
    const out = redactPII({
      cpf: '12345678900',
      phone: '5511999998888',
      email: 'a@b.com',
      access_token: 'sk-abc',
      content: 'texto da mensagem do cliente',
      nested: { customer_cpf: '999', ok: 'visível' },
    });
    expect(out.cpf).toBe('[REDACTED]');
    expect(out.phone).toBe('[REDACTED]');
    expect(out.email).toBe('[REDACTED]');
    expect(out.access_token).toBe('[REDACTED]');
    expect(out.content).toBe('[REDACTED]');
    expect(out.nested.customer_cpf).toBe('[REDACTED]');
    expect(out.nested.ok).toBe('visível');
  });

  it('preserva campos estruturais/já-seguros', () => {
    const out = redactPII({ tenant_id: 't1', phone_last4: '8888', latency_ms: 42, event: 'x' });
    expect(out.tenant_id).toBe('t1');
    expect(out.phone_last4).toBe('8888');
    expect(out.latency_ms).toBe(42);
  });

  it('logger.info não vaza PII no JSON emitido', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('lookup', { cpf: '12345678900', tenant_id: 't1' });
    const logged = spy.mock.calls[0][0] as string;
    expect(logged).not.toContain('12345678900');
    expect(logged).toContain('[REDACTED]');
    expect(logged).toContain('t1');
  });
});
