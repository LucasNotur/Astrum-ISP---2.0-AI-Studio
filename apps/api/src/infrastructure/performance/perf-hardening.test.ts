import { describe, it, expect } from 'vitest';
import {
  getMissingIndexes,
  generateIndexSQL,
  generateAllMissingIndexSQL,
  validateQueueTuning,
  QUEUE_TUNING,
  PERFORMANCE_THRESHOLDS,
  INDEX_RECOMMENDATIONS,
} from './perf-hardening';

describe('perf-hardening', () => {
  it('index recommendations cobrem tabelas críticas do portal e cobrança', () => {
    const tables = INDEX_RECOMMENDATIONS.map((i) => i.table);
    expect(tables).toContain('invoices');
    expect(tables).toContain('service_orders');
    expect(tables).toContain('customers');
    expect(tables).toContain('tickets');
  });

  it('getMissingIndexes retorna apenas índices não existentes', () => {
    const missing = getMissingIndexes();
    expect(missing.every((i) => !i.exists)).toBe(true);
    expect(missing.length).toBeGreaterThan(0);
  });

  it('generateIndexSQL gera SQL válido', () => {
    const sql = generateIndexSQL({
      table: 'invoices',
      columns: ['tenant_id', 'customer_id', 'status'],
      reason: 'test',
      exists: false,
    });
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS');
    expect(sql).toContain('invoices');
    expect(sql).toContain('tenant_id, customer_id, status');
  });

  it('generateAllMissingIndexSQL gera múltiplos CREATE INDEX', () => {
    const sql = generateAllMissingIndexSQL();
    const count = (sql.match(/CREATE INDEX/g) ?? []).length;
    expect(count).toBe(getMissingIndexes().length);
  });

  it('todas as queue configs são válidas', () => {
    for (const config of QUEUE_TUNING) {
      const errors = validateQueueTuning(config);
      expect(errors, `${config.name} tem erros: ${errors.join(', ')}`).toHaveLength(0);
    }
  });

  it('QUEUE_TUNING cobre as filas críticas', () => {
    const names = QUEUE_TUNING.map((q) => q.name);
    expect(names).toContain('astrum:messages');
    expect(names).toContain('astrum:cobrai');
    expect(names).toContain('astrum:crisis-detector');
  });

  it('PERFORMANCE_THRESHOLDS inclui as 4 categorias', () => {
    const cats = new Set(PERFORMANCE_THRESHOLDS.map((p) => p.category));
    expect(cats).toContain('latency');
    expect(cats).toContain('throughput');
    expect(cats).toContain('quality');
    expect(cats).toContain('cost');
  });

  it('lighthouse target ≥ 85 performance e ≥ 90 accessibility', () => {
    const perf = PERFORMANCE_THRESHOLDS.find((p) => p.metric === 'lighthouse_performance');
    const a11y = PERFORMANCE_THRESHOLDS.find((p) => p.metric === 'lighthouse_accessibility');
    expect(perf?.target).toBeGreaterThanOrEqual(85);
    expect(a11y?.target).toBeGreaterThanOrEqual(90);
  });

  it('custo por conversa ≤ R$0.15', () => {
    const cost = PERFORMANCE_THRESHOLDS.find((p) => p.metric === 'cost_per_conversation_brl');
    expect(cost?.target).toBeLessThanOrEqual(0.15);
  });

  it('validateQueueTuning detecta config inválida', () => {
    const invalid = { name: 'bad', concurrency: 100, maxRetries: 20, backoffType: 'fixed' as const, backoffDelay: 1000, removeOnComplete: 0 };
    const errors = validateQueueTuning(invalid);
    expect(errors.length).toBeGreaterThan(0);
  });
});
