import { describe, it, expect } from 'vitest';
import { validateSql, SqlGuardError } from './sql-guard';

describe('sql-guard (IA-44)', () => {
  // ── Recusas de DML/DDL ───────────────────────────────────────────────────
  it('recusa UPDATE', () => {
    expect(() => validateSql("UPDATE customers SET status='x'")).toThrow(SqlGuardError);
  });

  it('recusa DELETE', () => {
    expect(() => validateSql('DELETE FROM customers')).toThrow(SqlGuardError);
  });

  it('recusa INSERT', () => {
    expect(() => validateSql("INSERT INTO customers(name) VALUES ('x')")).toThrow(SqlGuardError);
  });

  it('recusa DROP TABLE', () => {
    expect(() => validateSql('DROP TABLE customers')).toThrow(SqlGuardError);
  });

  it('recusa CREATE TABLE', () => {
    expect(() => validateSql('CREATE TABLE x (id int)')).toThrow(SqlGuardError);
  });

  it('recusa ALTER TABLE', () => {
    expect(() => validateSql('ALTER TABLE customers ADD COLUMN x int')).toThrow(SqlGuardError);
  });

  it('recusa TRUNCATE', () => {
    expect(() => validateSql('TRUNCATE customers')).toThrow(SqlGuardError);
  });

  // ── Funções perigosas (denylist) ─────────────────────────────────────────
  it('recusa SELECT pg_sleep(10)', () => {
    try {
      validateSql('SELECT pg_sleep(10)');
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(SqlGuardError);
      expect(e.message).toMatch(/pg_sleep/i);
      expect(e.hint).toMatch(/pg_sleep|funç/i);
    }
  });

  it('recusa pg_read_file', () => {
    expect(() => validateSql("SELECT pg_read_file('/etc/passwd')")).toThrow(SqlGuardError);
  });

  it('recusa dblink', () => {
    expect(() => validateSql("SELECT * FROM dblink('db', 'SELECT 1') AS t(x int)")).toThrow(SqlGuardError);
  });

  // ── CTE com DML ──────────────────────────────────────────────────────────
  it('recusa CTE com DELETE (WITH x AS (DELETE ...) SELECT * FROM x)', () => {
    expect(() =>
      validateSql('WITH x AS (DELETE FROM customers RETURNING id) SELECT * FROM x'),
    ).toThrow(SqlGuardError);
  });

  it('recusa CTE com UPDATE', () => {
    expect(() =>
      validateSql('WITH x AS (UPDATE customers SET status=\'x\' RETURNING id) SELECT * FROM x'),
    ).toThrow(SqlGuardError);
  });

  // ── Allowlist de tabelas ─────────────────────────────────────────────────
  it('recusa tabela real customers (fora da allowlist)', () => {
    expect(() => validateSql('SELECT * FROM customers')).toThrow(SqlGuardError);
  });

  it('recusa tabela real invoices (fora da allowlist)', () => {
    expect(() => validateSql('SELECT * FROM invoices')).toThrow(SqlGuardError);
  });

  // ── Multi-statement ──────────────────────────────────────────────────────
  it('recusa SELECT 1; DROP TABLE customers (multi-statement)', () => {
    expect(() => validateSql('SELECT 1; DROP TABLE customers')).toThrow(SqlGuardError);
  });

  it('recusa SELECT 1; SELECT 2 (multi-statement)', () => {
    expect(() => validateSql('SELECT 1; SELECT 2')).toThrow(SqlGuardError);
  });

  // ── SELECT INTO ──────────────────────────────────────────────────────────
  it('recusa SELECT INTO', () => {
    expect(() =>
      validateSql('SELECT * INTO tmp_table FROM vw_agent_invoices'),
    ).toThrow(SqlGuardError);
  });

  // ── Aceitações + injeção de LIMIT e WHERE ────────────────────────────────
  it('aceita SELECT * FROM vw_agent_invoices e injeta LIMIT 500', () => {
    const r = validateSql('SELECT * FROM vw_agent_invoices');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sql).toMatch(/\bLIMIT\s*\(?500\)?/i);
  });

  it('aceita SELECT id, amount_cents FROM vw_agent_invoices com WHERE por tenant_id (não duplica)', () => {
    const r = validateSql("SELECT id, amount_cents FROM vw_agent_invoices WHERE tenant_id='abc'");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sql).toMatch(/tenant_id/i);
    expect(r.sql).toMatch(/\bLIMIT\s*\(?500\)?/i);
    // Não deve ter injetado um segundo tenant_id
    const occurrences = (r.sql.match(/tenant_id/gi) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('injeta WHERE tenant_id = $1 quando ausente', () => {
    const r = validateSql('SELECT id FROM vw_agent_tickets');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sql).toMatch(/tenant_id\s*=\s*\(?\$1\)?/i);
    expect(r.sql).toMatch(/\bLIMIT\s*\(?500\)?/i);
  });

  it('aceita SELECT com WHERE em outra coluna + LIMIT custom; injeta tenant_id E mantém LIMIT', () => {
    const r = validateSql("SELECT id FROM vw_agent_invoices WHERE status='paid' LIMIT 10");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sql).toMatch(/tenant_id\s*=\s*\(?\$1\)?/i);
    expect(r.sql).toMatch(/\bLIMIT\s*\(?10\)?/i);
  });

  it('preserva LIMIT existente se já é menor ou igual a 500', () => {
    const r = validateSql('SELECT id FROM vw_agent_customers LIMIT 50');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sql).toMatch(/\bLIMIT\s*\(?50\)?/i);
    expect(r.sql).not.toMatch(/LIMIT\s*\(?500\)?/i);
  });

  // ── Aceitações em todas as views ─────────────────────────────────────────
  it.each([
    ['vw_agent_customers'],
    ['vw_agent_invoices'],
    ['vw_agent_tickets'],
  ])('aceita SELECT 1 FROM %s (LIMIT 500 injetado)', (view) => {
    const r = validateSql(`SELECT 1 FROM ${view}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sql).toMatch(/\bLIMIT\s*\(?500\)?/i);
  });

  // ── Robustez de entrada ──────────────────────────────────────────────────
  it('rejeita SQL vazia', () => {
    expect(() => validateSql('   ')).toThrow(SqlGuardError);
  });

  it('rejeita SQL muito longa (>10k)', () => {
    const big = 'SELECT 1 FROM vw_agent_invoices WHERE id=\'' + 'a'.repeat(10_001) + '\'';
    expect(() => validateSql(big)).toThrow(SqlGuardError);
  });

  it('rejeita SQL com sintaxe inválida', () => {
    expect(() => validateSql('SELEKT * FROM vw_agent_invoices')).toThrow(SqlGuardError);
  });
});
