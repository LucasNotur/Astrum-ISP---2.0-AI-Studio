/**
 * IA-44 — SqlGuard (PURO, zero I/O, 100% testável).
 *
 * Defensa dupla:
 *  1. sql-guard.ts (este arquivo) — valida o AST antes de qualquer I/O.
 *  2. migration 045_agent_readonly_role.sql — role Postgres sem permissão
 *     de escrita e com statement_timeout = 3s, executada na conexão sandbox.
 *
 * Política:
 *  - Aceita APENAS 1 statement SELECT (sem `;` separador, sem UNION-extra).
 *  - Tabelas permitidas: vw_agent_customers, vw_agent_invoices, vw_agent_tickets.
 *  - Funções denylist: pg_sleep, pg_read_file, dblink, lo_export, lo_import, pg_ls_dir.
 *  - CTE com DML (WITH x AS (DELETE ...) SELECT) → recusa.
 *  - SELECT INTO → recusa.
 *  - Injeta LIMIT 500 se ausente.
 *  - Injeta WHERE tenant_id = $1 na raiz se a view tem tenant_id
 *    e o WHERE de topo ainda não filtra por essa coluna.
 *
 * Saída:
 *  - `{ sql: string }` quando aceita.
 *  - `SqlGuardError({ message, hint })` quando recusa.
 */

import { parse, toSql, astVisitor, type Statement, type SelectStatement, type WithStatement, type Expr, type SelectedColumn } from 'pgsql-ast-parser';

const ALLOWED_TABLES = new Set([
  'vw_agent_customers',
  'vw_agent_invoices',
  'vw_agent_tickets',
]);

const DENIED_FUNCTIONS = new Set([
  'pg_sleep',
  'pg_read_file',
  'dblink',
  'lo_export',
  'lo_import',
  'pg_ls_dir',
]);

const TABLES_WITH_TENANT_ID = new Set([
  'vw_agent_customers',
  'vw_agent_invoices',
  'vw_agent_tickets',
]);

const MAX_ROWS = 500;

export class SqlGuardError extends Error {
  public readonly hint: string;
  constructor(message: string, hint: string) {
    super(message);
    this.name = 'SqlGuardError';
    this.hint = hint;
  }
}

interface ValidationResult {
  ok: true;
  sql: string;
}

interface ValidationFailure {
  ok: false;
  error: SqlGuardError;
}

type GuardOutcome = ValidationResult | ValidationFailure;

function fail(message: string, hint: string): ValidationFailure {
  return { ok: false, error: new SqlGuardError(message, hint) };
}

function isSelectStatement(stmt: Statement): stmt is SelectStatement {
  if (!stmt || typeof stmt !== 'object') return false;
  const t = (stmt as { type?: string }).type;
  return t === 'select' || t === 'with' || t === 'with recursive' || t === 'union' || t === 'union all' || t === 'values';
}

function collectCteAliases(stmt: Statement): Set<string> {
  const aliases = new Set<string>();
  if (!stmt || typeof stmt !== 'object') return aliases;
  const t = (stmt as { type?: string }).type;
  if (t === 'with' || t === 'with recursive') {
    const w = stmt as WithStatement;
    for (const binding of w.bind ?? []) {
      const aliasName = (binding.alias as { name?: string } | string | undefined);
      if (typeof aliasName === 'string') aliases.add(aliasName);
      else if (aliasName && typeof aliasName === 'object' && 'name' in aliasName) {
        aliases.add(String((aliasName as { name: string }).name));
      }
    }
  }
  return aliases;
}

function isAExpr(node: unknown): node is { type: string; [k: string]: unknown } {
  return !!node && typeof node === 'object' && 'type' in (node as object);
}

function whereReferencesTenantId(where: Expr | null | undefined): boolean {
  if (!where) return false;
  let found = false;
  const visitor = astVisitor((v) => ({
    ref: (r: { name?: string | number }) => {
      if (r && r.name === 'tenant_id') found = true;
      v.super().ref(r as any);
    },
  }));
  visitor.expr(where);
  return found;
}

/**
 * Valida a SQL e devolve o SQL limpo (com LIMIT/tenant_id injetados) ou
 * lança SqlGuardError.
 */
export function validateSql(rawSql: string): ValidationResult {
  if (typeof rawSql !== 'string') {
    throw new SqlGuardError('SQL ausente.', 'Envie um SELECT no corpo da requisição.');
  }
  const sql = rawSql.trim();
  if (!sql) {
    throw new SqlGuardError('SQL vazia.', 'Digite um SELECT antes de executar.');
  }
  if (sql.length > 10_000) {
    throw new SqlGuardError('SQL muito longa.', 'Limite o tamanho da consulta a 10.000 caracteres.');
  }

  let statements: Statement[];
  try {
    statements = parse(sql);
  } catch (e) {
    throw new SqlGuardError(
      'Sintaxe SQL inválida.',
      'Confira a sintaxe — o parser PostgreSQL recusou esta consulta.',
    );
  }

  if (!Array.isArray(statements) || statements.length !== 1) {
    throw new SqlGuardError(
      'Apenas uma consulta por vez.',
      'O sandbox aceita 1 statement SELECT por chamada. Remova `;` extras.',
    );
  }

  if (sql.includes(';')) {
    // Defesa em profundidade: parser pode aceitar 1 statement com `;` no fim.
    // Se sobrar `;` fora de aspas/comentários, ainda rejeitamos.
    if (/;(?![^\n]*--)/.test(sql.replace(/'[^']*'/g, "''"))) {
      throw new SqlGuardError(
        'Multi-statement detectado.',
        'O sandbox aceita 1 statement SELECT por chamada. Remova `;` extras.',
      );
    }
  }

  const stmt: Statement = statements[0] as Statement;
  if (!isSelectStatement(stmt)) {
    throw new SqlGuardError(
      'Apenas SELECT é permitido.',
      'UPDATE/INSERT/DELETE/DDL são bloqueados pelo sandbox.',
    );
  }

  // ── Walk do AST: CTE aliases, denylist de funções, allowlist de tabelas ──
  const cteAliases = collectCteAliases(stmt);

  let badFunction: string | null = null;
  let badTable: string | null = null;
  let dmlInCte: string | null = null;

  const visitor = astVisitor((v) => ({
    call: (c: { function?: { name?: string; schema?: string } }) => {
      const fname = c?.function?.name;
      if (fname && DENIED_FUNCTIONS.has(fname.toLowerCase())) {
        badFunction = fname;
      }
      v.super().call(c as any);
    },
    tableRef: (t: { name?: string; schema?: string }) => {
      const tname = t?.name;
      if (tname && !cteAliases.has(tname) && !ALLOWED_TABLES.has(tname)) {
        badTable = tname;
      }
      v.super().tableRef(t as any);
    },
    update: () => { dmlInCte = 'UPDATE'; v.super().update({} as any); },
    insert: () => { dmlInCte = 'INSERT'; v.super().insert({} as any); },
    delete: () => { dmlInCte = 'DELETE'; v.super().delete({} as any); },
  }));

  try {
    visitor.statement(stmt);
  } catch (e) {
    throw new SqlGuardError(
      'Falha ao inspecionar a SQL.',
      'O sandbox não conseguiu validar a consulta. Simplifique e tente de novo.',
    );
  }

  if (badFunction) {
    throw new SqlGuardError(
      `Função bloqueada: ${badFunction}.`,
      `O sandbox não permite chamar funções sensíveis (pg_sleep, leitura de arquivos, etc).`,
    );
  }
  if (badTable) {
    throw new SqlGuardError(
      `Tabela/view fora da allowlist: ${badTable}.`,
      'Use somente vw_agent_customers, vw_agent_invoices ou vw_agent_tickets.',
    );
  }
  if (dmlInCte) {
    throw new SqlGuardError(
      `CTE com ${dmlInCte} detectada.`,
      'O sandbox não aceita CTEs que executam DML (INSERT/UPDATE/DELETE).',
    );
  }

  // ── SELECT INTO: bloqueado (não há "into" no AST do parser — defesa extra) ──
  if (/select[\s\S]+\binto\s+/i.test(sql)) {
    throw new SqlGuardError(
      'SELECT INTO não é permitido.',
      'O sandbox é somente leitura e não pode atribuir resultado a uma variável.',
    );
  }

  // ── Injeção de LIMIT 500 e WHERE tenant_id = $1 (defesa em profundidade) ──
  const rewritten = injectGuards(stmt);

  let out: string;
  try {
    out = toSql.statement(rewritten).trim();
  } catch (e) {
    throw new SqlGuardError(
      'Falha ao reconstruir a SQL validada.',
      'O sandbox não conseguiu regenerar a SQL. Tente outra forma equivalente.',
    );
  }

  // Defesa adicional: garante que algum LIMIT está presente.
  // O toSql pode envelopar inteiros em parênteses (LIMIT (500)) — tolerar isso.
  if (!/\bLIMIT\s*\(?\d+\)?/i.test(out)) {
    out = out.replace(/;?\s*$/, '') + ` LIMIT ${MAX_ROWS}`;
  }

  return { ok: true, sql: out };
}

/**
 * Aplica LIMIT 500 e WHERE tenant_id = $1 no SELECT raiz.
 * Não mexe em subqueries internas.
 */
function injectGuards(stmt: Statement): Statement {
  const cloned = JSON.parse(JSON.stringify(stmt)) as Statement;
  applyToRootSelect(cloned);
  return cloned;
}

function applyToRootSelect(stmt: Statement): void {
  const t = (stmt as { type?: string }).type;
  if (t === 'with' || t === 'with recursive') {
    const w = stmt as WithStatement;
    applyToRootSelect(w.in as unknown as Statement);
    return;
  }
  if (t === 'union' || t === 'union all') {
    return;
  }
  if (t !== 'select') return;
  const select = stmt as { where?: Expr | null; limit?: { limit?: Expr } | null; from?: Array<{ name?: { name?: string } }> | null };

  if (!select.limit || !select.limit.limit) {
    select.limit = {
      limit: { type: 'integer', value: MAX_ROWS } as unknown as Expr,
    };
  }

  const fromTableNames = (select.from ?? [])
    .map((f) => (f as { name?: { name?: string } }).name?.name)
    .filter((n): n is string => !!n);

  const viewNeedsTenantId = fromTableNames.some((n) => TABLES_WITH_TENANT_ID.has(n));
  if (!viewNeedsTenantId) return;

  if (whereReferencesTenantId(select.where ?? null)) return;

  const newWhere: Expr = {
    type: 'binary',
    op: '=',
    left: { type: 'ref', name: 'tenant_id' } as unknown as Expr,
    right: { type: 'parameter', name: '$1' } as unknown as Expr,
  } as unknown as Expr;

  if (select.where && isAExpr(select.where)) {
    select.where = {
      type: 'binary',
      op: 'AND',
      left: select.where,
      right: newWhere,
    } as unknown as Expr;
  } else {
    select.where = newWhere;
  }
}
