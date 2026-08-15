/**
 * MT-02 opção (c) — Teste de ACEITAÇÃO do isolamento por GUC contra o Postgres REAL.
 *
 * Prova, no motor, que a migration 096 + o helper `withTenantRLS` isolam por tenant SEM
 * JWT do Supabase: com `SET LOCAL ROLE authenticated` + `set_config('app.current_tenant', T)`
 * (e SEM `request.jwt.claims` → `auth.uid()` NULL), a RLS filtra pelo GUC.
 *
 * ⚠️ Gated em DATABASE_URL — pula no CI unitário. Requer a **migration 096 aplicada** na
 * base alvo (senão `get_tenant_id()` ainda não lê o GUC e o 1º assert falha, como esperado).
 * Tudo roda em transação com ROLLBACK: não grava nada.
 * Ex.: DATABASE_URL=postgres://... npx vitest run apps/api/src/infrastructure/database/tenant-rls.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

const DSN = process.env.DATABASE_URL;
const isLocal = !!DSN && /localhost|127\.0\.0\.1/.test(DSN);

describe.skipIf(!DSN)('MT-02 (c) — isolamento RLS por GUC (Postgres real)', () => {
  let client: Client | null = null;
  let tenantId: string | null = null;
  let otherTenant: string | null = null;
  let ready = false;

  beforeAll(async () => {
    try {
      client = new Client({ connectionString: DSN, ssl: isLocal ? undefined : { rejectUnauthorized: false } });
      await client.connect();
      const { rows } = await client.query(
        `SELECT DISTINCT tenant_id FROM public.customers WHERE tenant_id IS NOT NULL LIMIT 2`,
      );
      tenantId = rows[0]?.tenant_id ?? null;
      otherTenant = rows[1]?.tenant_id ?? null;
      ready = !!tenantId;
      if (!ready) console.warn('[MT-02c] conectou mas sem customers com tenant — pulando.');
    } catch (err) {
      console.warn(`[MT-02c] sem conexão ao Postgres (${(err as Error).message}) — pulados.`);
      ready = false;
    }
  });

  afterAll(async () => { await client?.end().catch(() => {}); });

  /** Roda fn como `authenticated` com o tenant fixado SÓ pelo GUC (sem jwt.claims). */
  async function asGucTenant<T>(t: string, fn: () => Promise<T>): Promise<T> {
    await client!.query('BEGIN');
    try {
      await client!.query('SET LOCAL ROLE authenticated');
      await client!.query(`SELECT set_config('app.current_tenant', $1, true)`, [t]);
      return await fn();
    } finally {
      await client!.query('ROLLBACK');
    }
  }

  it('get_tenant_id() resolve pelo GUC e customers isola pelo tenant', async (ctx) => {
    if (!ready) return ctx.skip();
    await asGucTenant(tenantId!, async () => {
      const tid = (await client!.query(`SELECT public.get_tenant_id()::text AS t`)).rows[0].t;
      expect(tid).toBe(tenantId);

      const leak = (
        await client!.query(`SELECT count(*)::int AS n FROM public.customers WHERE tenant_id <> $1`, [tenantId])
      ).rows[0].n;
      expect(leak).toBe(0);
    });
  });

  it('sem GUC (nem jwt) → get_tenant_id() NULL → customers vazio (fail-closed)', async (ctx) => {
    if (!ready) return ctx.skip();
    await client!.query('BEGIN');
    try {
      await client!.query('SET LOCAL ROLE authenticated');
      // nenhum set_config('app.current_tenant', ...) e nenhum request.jwt.claims
      const tid = (await client!.query(`SELECT public.get_tenant_id() AS t`)).rows[0].t;
      expect(tid).toBeNull();
      const n = (await client!.query(`SELECT count(*)::int AS n FROM public.customers`)).rows[0].n;
      expect(n).toBe(0);
    } finally {
      await client!.query('ROLLBACK');
    }
  });

  it('tenant do GUC não enxerga linhas de outro tenant', async (ctx) => {
    if (!ready || !otherTenant) return ctx.skip();
    await asGucTenant(tenantId!, async () => {
      const n = (
        await client!.query(`SELECT count(*)::int AS n FROM public.customers WHERE tenant_id = $1`, [otherTenant])
      ).rows[0].n;
      expect(n).toBe(0);
    });
  });
});
