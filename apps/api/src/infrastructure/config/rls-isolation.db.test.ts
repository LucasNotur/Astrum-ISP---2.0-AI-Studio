/**
 * OBS-02 — Teste de ISOLAMENTO RLS contra o Postgres REAL (não mock).
 *
 * O teste irmão `rls-isolation.test.ts` exercita apenas lógica JS em memória e por isso
 * deixou passar os P0 de RLS (views SECURITY DEFINER, GRANT do anon). Este aqui conecta no
 * banco e PROVA, no motor, que:
 *   1. um usuário autenticado só enxerga o próprio tenant (inclusive via vw_agent_*);
 *   2. a auto-elevação de role/tenant_id (MT-01) é bloqueada;
 *   3. o backend (service_role/postgres) ainda consegue administrar role (não regrediu).
 *
 * É gated em DATABASE_URL — pula no CI unitário normal. Rodar contra uma branch/staging
 * (ou a cloud com credencial de leitura). Tudo roda em transação com ROLLBACK: não grava nada.
 * Ex.: DATABASE_URL=postgres://... npx vitest run apps/api/src/infrastructure/config/rls-isolation.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

const DSN = process.env.DATABASE_URL;
const isLocal = !!DSN && /localhost|127\.0\.0\.1/.test(DSN);

describe.skipIf(!DSN)('RLS isolation (Postgres real) — OBS-02', () => {
  let client: Client | null = null;
  let principal: { id: string; tenant_id: string } | null = null;
  let ready = false;

  beforeAll(async () => {
    try {
      client = new Client({ connectionString: DSN, ssl: isLocal ? undefined : { rejectUnauthorized: false } });
      await client.connect();
      const { rows } = await client.query(
        `SELECT id, tenant_id FROM public.users WHERE tenant_id IS NOT NULL LIMIT 1`,
      );
      principal = rows[0] ?? null;
      ready = !!principal;
      if (!principal) console.warn('[OBS-02] conectou mas não há usuário com tenant — pulando asserts.');
    } catch (err) {
      // DATABASE_URL presente mas inacessível (senha stale/host errado): pular, não quebrar o CI.
      console.warn(`[OBS-02] sem conexão ao Postgres (${(err as Error).message}) — testes pulados.`);
      ready = false;
    }
  });

  afterAll(async () => { await client?.end().catch(() => {}); });

  /** Roda fn dentro de uma tx como o usuário autenticado, sempre com ROLLBACK. */
  async function asAuthenticated<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    await client!.query('BEGIN');
    try {
      await client!.query('SET LOCAL role authenticated');
      await client!.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
      return await fn();
    } finally {
      await client!.query('ROLLBACK');
    }
  }

  it('usuário só vê o próprio tenant (tabela e view vw_agent_*)', async (ctx) => {
    if (!ready) return ctx.skip();
    await asAuthenticated(principal!.id, async () => {
      const tid = (await client!.query(`SELECT public.get_tenant_id()::text AS t`)).rows[0].t;
      expect(tid).toBe(principal!.tenant_id);

      const leakTable = (
        await client!.query(`SELECT count(*)::int AS n FROM public.customers WHERE tenant_id <> $1`, [
          principal!.tenant_id,
        ])
      ).rows[0].n;
      expect(leakTable).toBe(0);

      const leakView = (
        await client!.query(`SELECT count(*)::int AS n FROM public.vw_agent_customers WHERE tenant_id <> $1`, [
          principal!.tenant_id,
        ])
      ).rows[0].n;
      expect(leakView).toBe(0);
    });
  });

  it('MT-01: auto-elevação a super_admin é bloqueada', async (ctx) => {
    if (!ready) return ctx.skip();
    await expect(
      asAuthenticated(principal!.id, () =>
        client!.query(`UPDATE public.users SET role='super_admin' WHERE id=$1`, [principal!.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('MT-01: troca do próprio tenant_id é bloqueada', async (ctx) => {
    if (!ready) return ctx.skip();
    await expect(
      asAuthenticated(principal!.id, () =>
        client!.query(`UPDATE public.users SET tenant_id=gen_random_uuid() WHERE id=$1`, [principal!.id]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('não-regressão: backend (postgres/service_role) ainda administra role', async (ctx) => {
    if (!ready) return ctx.skip();
    await client!.query('BEGIN');
    try {
      // sem SET ROLE → current_user é o papel da conexão (postgres/service_role) → trigger permite
      await expect(
        client!.query(`UPDATE public.users SET role=role WHERE id=$1`, [principal!.id]),
      ).resolves.toBeTruthy();
    } finally {
      await client!.query('ROLLBACK');
    }
  });
});
