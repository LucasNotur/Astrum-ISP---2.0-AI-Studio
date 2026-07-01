/**
 * Runner de migrations ordenado com tracking — fonte canônica: packages/db/src/migrations/*.sql
 *
 * Substitui o antigo run-migrations.ts da raiz (que só rodava supabase-migrations.sql).
 *
 * Uso:
 *   tsx packages/db/src/migrate.ts             # aplica migrations pendentes
 *   tsx packages/db/src/migrate.ts --dry-run   # mostra o plano, não escreve nada
 *   tsx packages/db/src/migrate.ts --baseline  # marca TODAS como aplicadas SEM rodar
 *                                              # (para bancos existentes onde 001–014 já foram aplicadas à mão)
 *
 * Requer DATABASE_URL no ambiente (.env). Cada migration roda em sua própria transação;
 * já aplicadas (registradas em schema_migrations) são puladas.
 */
import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const DRY_RUN = process.argv.includes('--dry-run');
const BASELINE = process.argv.includes('--baseline');

interface Migration {
  filename: string;
  sql: string;
  checksum: string;
}

function loadMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort() // ordem lexicográfica = numérica (001, 002, ... 020)
    .map((filename) => {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf-8');
      const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 16);
      return { filename, sql, checksum };
    });
}

async function ensureTrackingTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getApplied(client: Client): Promise<Map<string, string>> {
  const { rows } = await client.query<{ filename: string; checksum: string }>(
    'SELECT filename, checksum FROM schema_migrations'
  );
  return new Map(rows.map((r) => [r.filename, r.checksum]));
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL ausente no ambiente (.env).');
    process.exit(1);
  }

  const migrations = loadMigrations();
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await ensureTrackingTable(client);
    const applied = await getApplied(client);

    // Alerta de drift: arquivo aplicado cujo conteúdo mudou depois.
    for (const m of migrations) {
      const prev = applied.get(m.filename);
      if (prev && prev !== m.checksum) {
        console.warn(`⚠️  ${m.filename} foi alterada após ser aplicada (checksum divergente). Migrations devem ser imutáveis.`);
      }
    }

    const pending = migrations.filter((m) => !applied.has(m.filename));

    if (BASELINE) {
      console.log(`📌 Baseline: marcando ${pending.length} migration(s) como aplicadas SEM executar.`);
      for (const m of pending) {
        console.log(`   - ${m.filename}`);
        if (!DRY_RUN) {
          await client.query(
            'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [m.filename, m.checksum]
          );
        }
      }
      console.log(DRY_RUN ? '(dry-run — nada gravado)' : '✅ Baseline concluído.');
      return;
    }

    if (pending.length === 0) {
      console.log('✅ Nenhuma migration pendente. Banco atualizado.');
      return;
    }

    console.log(`${DRY_RUN ? '🔎 [DRY-RUN] ' : ''}Migrations pendentes (${pending.length}):`);
    for (const m of pending) console.log(`   - ${m.filename}`);
    if (DRY_RUN) {
      console.log('(dry-run — nada foi executado)');
      return;
    }

    for (const m of pending) {
      process.stdout.write(`▶️  Aplicando ${m.filename} ... `);
      try {
        await client.query('BEGIN');
        await client.query(m.sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [m.filename, m.checksum]
        );
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FALHOU');
        console.error(`\n❌ Erro em ${m.filename}:`, (err as Error).message);
        console.error('   Rollback aplicado. Corrija e rode novamente (as anteriores já estão registradas).');
        process.exit(1);
      }
    }
    console.log('✅ Todas as migrations pendentes foram aplicadas.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Erro fatal no runner de migrations:', err);
  process.exit(1);
});
