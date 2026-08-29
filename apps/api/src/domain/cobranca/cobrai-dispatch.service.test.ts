import { describe, it, expect } from 'vitest';
import {
  overdueDaysOf,
  computeStage,
  buildCobraiEnqueue,
  pickSendMessageRule,
  buildCobraiMessage,
} from './cobrai-dispatch.service';
import type { CobraiRule } from '../ports/cobranca.port';

const NOW = Date.UTC(2026, 7, 15); // 2026-08-15
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString();

describe('overdueDaysOf', () => {
  it('conta dias de atraso e trata data inválida', () => {
    expect(overdueDaysOf(iso(2026, 7, 5), NOW)).toBe(10);
    expect(overdueDaysOf(iso(2026, 7, 20), NOW)).toBe(-5); // ainda não venceu
    expect(overdueDaysOf('não-é-data', NOW)).toBe(0);
  });
});

describe('computeStage', () => {
  it('mapeia os limiares da régua (mesmos do legado)', () => {
    expect(computeStage(iso(2026, 6, 10), NOW)).toBe('D_PLUS_30'); // ~36d
    expect(computeStage(iso(2026, 6, 28), NOW)).toBe('D_PLUS_15'); // ~18d
    expect(computeStage(iso(2026, 7, 10), NOW)).toBe('D_PLUS_3');  // 5d
    expect(computeStage(iso(2026, 7, 15), NOW)).toBe('D_ZERO');    // 0d
    expect(computeStage(iso(2026, 7, 14), NOW)).toBe('D_ZERO');    // 1d de atraso → já venceu (D_ZERO), não pré-vencimento
    expect(computeStage(iso(2026, 7, 13), NOW)).toBe('D_ZERO');    // 2d de atraso → idem
    expect(computeStage(iso(2026, 7, 20), NOW)).toBe('D_MINUS_5'); // não venceu (-5d)
  });
});

describe('buildCobraiEnqueue', () => {
  const input = { customerId: 'c1', tenantId: 't1', stage: 'D_PLUS_3' as const, invoiceId: 'inv1', amountCents: 5000 };

  it('monta shape CobraiJobData (v2 — única engine desde a C1) com invoiceId/action', () => {
    expect(buildCobraiEnqueue(input)).toEqual({
      name: 'send_message',
      data: { tenantId: 't1', customerId: 'c1', invoiceId: 'inv1', action: 'send_message', amountCents: 5000 },
    });
  });

  it('sem invoiceId → invoiceId vazio (não quebra)', () => {
    const { data } = buildCobraiEnqueue({ customerId: 'c1', tenantId: 't1', stage: 'D_ZERO' });
    expect(data.invoiceId).toBe('');
  });

  it('inclui customerPhone e messageContent quando fornecidos (job que de fato envia)', () => {
    const { data } = buildCobraiEnqueue({
      ...input, customerPhone: '5511988887777', messageContent: 'Olá, sua fatura venceu.',
    });
    expect(data.customerPhone).toBe('5511988887777');
    expect(data.messageContent).toBe('Olá, sua fatura venceu.');
  });

  it('omite customerPhone/messageContent quando ausentes (shape antigo preservado)', () => {
    const { data } = buildCobraiEnqueue(input);
    expect(data).not.toHaveProperty('customerPhone');
    expect(data).not.toHaveProperty('messageContent');
  });
});

describe('pickSendMessageRule', () => {
  const rule = (daysOverdue: number, action: CobraiRule['action'] = 'send_message'): CobraiRule =>
    ({ id: `r${daysOverdue}`, name: `r${daysOverdue}`, daysOverdue, action, messageTemplate: `t${daysOverdue}`, active: true } as CobraiRule);
  const rules = [rule(1), rule(5), rule(10), rule(30), rule(0, 'suspend_signal')];

  it('escolhe a régua mais avançada já alcançada', () => {
    expect(pickSendMessageRule(rules, 7)?.daysOverdue).toBe(5);
    expect(pickSendMessageRule(rules, 40)?.daysOverdue).toBe(30);
    expect(pickSendMessageRule(rules, 10)?.daysOverdue).toBe(10);
  });

  it('atraso abaixo da primeira régua → usa a primeira (lembrete inicial)', () => {
    expect(pickSendMessageRule(rules, -3)?.daysOverdue).toBe(1);
  });

  it('ignora regras que não são send_message', () => {
    expect(pickSendMessageRule([rule(0, 'suspend_signal'), rule(0, 'notify_human')], 5)).toBeNull();
  });

  it('sem regras → null', () => {
    expect(pickSendMessageRule([], 5)).toBeNull();
  });
});

describe('buildCobraiMessage', () => {
  it('interpola nome, valor em BRL, dias e link de pagamento', () => {
    const msg = buildCobraiMessage('Olá {{customerName}}, fatura de R$ {{amountBRL}} ({{daysOverdue}}d): {{paymentLink}}', {
      customerName: 'Ana', amountCents: 12990, invoiceId: 'inv9', overdueDays: 5,
    });
    expect(msg).toBe('Olá Ana, fatura de R$ 129,90 (5d): https://pagar.astrum.com.br/inv9');
  });
});
