import * as duckdb from 'duckdb-async';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { infraLogger } from '../logging/logger';

/**
 * DuckDB Analytics — banco analítico in-process.
 *
 * Arquivo de banco: .data/analytics.duckdb
 * Em produção: montar volume persistente neste path.
 *
 * SEPARAÇÃO DE RESPONSABILIDADES:
 * - Supabase (PostgreSQL): dados transacionais, OLTP, fonte da verdade
 * - DuckDB: agregações, relatórios, análises históricas, OLAP
 *
 * Dados são copiados do Supabase para DuckDB via ETL periódico (Sprint 3).
 */

let db: duckdb.Database | null = null;

export async function getDuckDB(): Promise<duckdb.Database> {
  if (db) return db;

  const dbPath = process.env.NODE_ENV === 'test'
    ? ':memory:'
    : path.resolve(process.cwd(), '.data', 'analytics.duckdb');

  // Achado 2026-08-28: o diretório .data/ nunca era criado — DuckDB falhava
  // com "Cannot open file" (ENOENT no diretório pai), e como initAnalyticsSchema()
  // não tinha try/catch próprio em server.ts, isso derrubava em cascata o
  // registro de TODOS os workers seguintes (message-worker, cobrai-worker,
  // indexing-worker, documents-worker etc.) silenciosamente. Ver o try/catch
  // isolado em server.ts pra essa segunda parte do fix.
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });

  db = await duckdb.Database.create(dbPath);

  // Configurar para performance analítica
  const conn = await db.connect();
  await conn.run("SET memory_limit='512MB'");
  await conn.run("SET threads=4");
  await conn.close();

  infraLogger.info({ dbPath }, 'DuckDB iniciado');
  return db;
}

export async function closeDuckDB(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    infraLogger.info('DuckDB encerrado');
  }
}
