import { describe, it, expect } from 'vitest';
import {
  reaisToCents,
  mapCustomerStatus,
  mapTicketStatus,
  mapTicketPriority,
  mapMessageRole,
  buildCustomerRow,
  buildInvoiceRow,
  auditLogTargetTable,
} from './transform';

describe('ETL transform — reaisToCents (risco financeiro)', () => {
  it('converte inteiros', () => {
    expect(reaisToCents(100)).toBe(10000);
  });

  it('resolve o clássico erro de ponto flutuante 19.99', () => {
    // 19.99 * 100 = 1998.9999999998 em float; Math.round conserta.
    expect(reaisToCents(19.99)).toBe(1999);
  });

  it('arredonda meio centavo para cima', () => {
    expect(reaisToCents(10.005)).toBe(1001);
  });

  it('trata 0, null e undefined como 0', () => {
    expect(reaisToCents(0)).toBe(0);
    expect(reaisToCents(null)).toBe(0);
    expect(reaisToCents(undefined)).toBe(0);
    expect(reaisToCents(NaN)).toBe(0);
  });

  it('lança em valor não-finito (Infinity)', () => {
    expect(() => reaisToCents(Infinity)).toThrow();
  });

  it('preserva soma: total legado × 100 = soma dos centavos (validação do gate)', () => {
    const legacy = [19.99, 49.9, 100, 0.01];
    const totalReais = legacy.reduce((a, b) => a + b, 0); // 169.90
    const totalCents = legacy.map(reaisToCents).reduce((a, b) => a + b, 0);
    expect(totalCents).toBe(Math.round(totalReais * 100));
    expect(totalCents).toBe(16990);
  });
});

describe('ETL transform — enums divergentes', () => {
  it('customer status: inactive→suspended, pending→active', () => {
    expect(mapCustomerStatus('active')).toBe('active');
    expect(mapCustomerStatus('inactive')).toBe('suspended');
    expect(mapCustomerStatus('pending')).toBe('active');
    expect(mapCustomerStatus('CANCELED')).toBe('cancelled');
    expect(mapCustomerStatus('desconhecido')).toBe('active');
  });

  it('ticket status: in-progress→in_progress, escalated preservado', () => {
    expect(mapTicketStatus('in-progress')).toBe('in_progress');
    expect(mapTicketStatus('escalated')).toBe('escalated');
    expect(mapTicketStatus('open')).toBe('open');
    expect(mapTicketStatus(undefined)).toBe('open');
  });

  it('ticket priority: urgent→critical', () => {
    expect(mapTicketPriority('urgent')).toBe('critical');
    expect(mapTicketPriority('high')).toBe('high');
    expect(mapTicketPriority(null)).toBe('medium');
  });

  it('message role: customer→user, ai→assistant+fromAi, human→assistant', () => {
    expect(mapMessageRole('customer')).toEqual({ role: 'user', fromAi: false });
    expect(mapMessageRole('ai')).toEqual({ role: 'assistant', fromAi: true });
    expect(mapMessageRole('human')).toEqual({ role: 'assistant', fromAi: false });
    expect(mapMessageRole('system')).toEqual({ role: 'system', fromAi: false });
  });
});

describe('ETL transform — builders idempotentes', () => {
  it('buildCustomerRow usa legacy_id como chave e converte mrr', () => {
    const row = buildCustomerRow('t1', { id: 'cust_abc', name: 'João', mrr: 99.9, status: 'inactive' });
    expect(row.legacy_id).toBe('cust_abc');
    expect(row.tenant_id).toBe('t1');
    expect(row.mrr_cents).toBe(9990);
    expect(row.status).toBe('suspended');
  });

  it('buildCustomerRow é determinístico (mesmo input → mesmo output, exceto created_at default)', () => {
    const input = { id: 'c1', name: 'A', mrr: 10, status: 'active', createdAt: '2024-01-01T00:00:00Z' };
    expect(buildCustomerRow('t1', input)).toEqual(buildCustomerRow('t1', input));
  });

  it('buildInvoiceRow preserva payment_url e pix (dados críticos da cobrança)', () => {
    const row = buildInvoiceRow('t1', {
      id: 'inv1', customerId: 'c1', amount: 149.9,
      paymentUrl: 'https://pag.ar/x', pixCopyPaste: '00020126...',
    }, 'uuid-1');
    expect(row.amount_cents).toBe(14990);
    expect(row.payment_url).toBe('https://pag.ar/x');
    expect(row.pix_copy_paste).toBe('00020126...');
    expect(row.customer_id).toBe('uuid-1');
    expect(row.legacy_id).toBe('inv1');
  });

  it('buildInvoiceRow aceita customer não resolvido (null) sem quebrar', () => {
    const row = buildInvoiceRow('t1', { id: 'inv2', customerId: 'x', amount: 10 }, null);
    expect(row.customer_id).toBeNull();
  });
});

describe('ETL transform — armadilha audit_logs', () => {
  it('audit_logs legado NUNCA vai para audit_log (segurança), e sim ai_performance_logs', () => {
    expect(auditLogTargetTable()).toBe('ai_performance_logs');
  });
});
