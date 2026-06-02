import { describe, it, expect } from 'vitest';
import { PLAN_LIMITS } from './plan-limits.service';

describe('Plan Limits', () => {
  it('starter tem limite menor que pro', () => {
    expect(PLAN_LIMITS.starter.maxCustomers).toBeLessThan(PLAN_LIMITS.pro.maxCustomers);
    expect(PLAN_LIMITS.starter.maxDocuments).toBeLessThan(PLAN_LIMITS.pro.maxDocuments);
    expect(PLAN_LIMITS.starter.maxMessagesPerMonth).toBeLessThan(PLAN_LIMITS.pro.maxMessagesPerMonth);
  });

  it('enterprise não tem limites (Infinity)', () => {
    expect(PLAN_LIMITS.enterprise.maxCustomers).toBe(Infinity);
    expect(PLAN_LIMITS.enterprise.maxDocuments).toBe(Infinity);
    expect(PLAN_LIMITS.enterprise.maxOperators).toBe(Infinity);
  });

  it('starter não tem RAG habilitado', () => {
    expect(PLAN_LIMITS.starter.ragEnabled).toBe(false);
    expect(PLAN_LIMITS.pro.ragEnabled).toBe(true);
    expect(PLAN_LIMITS.enterprise.ragEnabled).toBe(true);
  });

  it('todos os planos têm CobrAI', () => {
    expect(PLAN_LIMITS.starter.cobraiEnabled).toBe(true);
    expect(PLAN_LIMITS.pro.cobraiEnabled).toBe(true);
    expect(PLAN_LIMITS.enterprise.cobraiEnabled).toBe(true);
  });

  it('preços em centavos fazem sentido', () => {
    expect(PLAN_LIMITS.starter.priceCentsPerMonth).toBeGreaterThan(0);
    expect(PLAN_LIMITS.pro.priceCentsPerMonth).toBeGreaterThan(PLAN_LIMITS.starter.priceCentsPerMonth);
    expect(PLAN_LIMITS.enterprise.priceCentsPerMonth).toBe(0); // negociado
  });
});
