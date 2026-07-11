import { describe, it, expect, vi } from 'vitest';
import { buildNegotiationMenu, type NegotiationDb } from './debt-negotiation.service';

function makeDb(policy: Record<string, unknown> | null): NegotiationDb {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: policy }),
        }),
      }),
    }),
  } as unknown as NegotiationDb;
}

describe('buildNegotiationMenu (P1-03)', () => {
  it('usa policy padrão quando tenant não tem cadastro', async () => {
    const db = makeDb(null);
    const menu = await buildNegotiationMenu(db, 't1', 10000);
    expect(menu.options.length).toBeGreaterThan(0);
    expect(menu.policy.max_discount_pct).toBe(10);
  });

  it('retorna opção à vista com desconto correto', async () => {
    const db = makeDb({ max_discount_pct: 10, max_installments: 3, enabled: true });
    const menu = await buildNegotiationMenu(db, 't1', 10000); // R$100
    const instant = menu.options.find(o => o.type === 'instant');
    expect(instant).toBeDefined();
    expect(instant!.total_cents).toBe(9000); // 10% off
    expect(instant!.discount_pct).toBe(10);
  });

  it('retorna opções de parcelamento até max_installments', async () => {
    const db = makeDb({ max_discount_pct: 5, max_installments: 3, enabled: true });
    const menu = await buildNegotiationMenu(db, 't1', 30000); // R$300
    const installments = menu.options.filter(o => o.type === 'installment');
    expect(installments).toHaveLength(2); // 2x e 3x
    expect(installments[0]!.installments).toBe(2);
    expect(installments[0]!.per_installment_cents).toBe(15000);
    expect(installments[1]!.installments).toBe(3);
    expect(installments[1]!.per_installment_cents).toBe(10000);
  });

  it('retorna menu vazio quando feature está desabilitada', async () => {
    const db = makeDb({ max_discount_pct: 10, max_installments: 3, enabled: false });
    const menu = await buildNegotiationMenu(db, 't1', 10000);
    expect(menu.options).toHaveLength(0);
  });

  it('retorna menu vazio quando dívida é zero', async () => {
    const db = makeDb(null);
    const menu = await buildNegotiationMenu(db, 't1', 0);
    expect(menu.options).toHaveLength(0);
  });

  it('expires_at é aproximadamente 24h no futuro', async () => {
    const db = makeDb(null);
    const menu = await buildNegotiationMenu(db, 't1', 5000);
    const diff = new Date(menu.expires_at).getTime() - Date.now();
    expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it('sem parcelamento quando max_installments < 2', async () => {
    const db = makeDb({ max_discount_pct: 10, max_installments: 1, enabled: true });
    const menu = await buildNegotiationMenu(db, 't1', 10000);
    const installments = menu.options.filter(o => o.type === 'installment');
    expect(installments).toHaveLength(0);
  });
});
