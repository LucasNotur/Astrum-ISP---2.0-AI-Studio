/**
 * ⚠️ DEPRECADO — não use este runner.
 *
 * Este script só aplicava `supabase-migrations.sql` (uma única fonte, hoje redundante).
 * A fonte canônica de migrations passou a ser `packages/db/src/migrations/*.sql`,
 * aplicada por um runner ordenado com tracking (schema_migrations).
 *
 * Use:
 *   npm run db:migrate        # aplica pendentes
 *   npm run db:migrate:dry    # mostra o plano
 *   npm run db:baseline       # marca existentes como aplicadas (banco já provisionado à mão)
 *
 * Ver docs/DB_CONSOLIDATION_NOTES.md.
 */
console.error(
  '[DEPRECADO] Use `npm run db:migrate` (packages/db/src/migrate.ts). Ver docs/DB_CONSOLIDATION_NOTES.md.'
);
process.exit(1);
