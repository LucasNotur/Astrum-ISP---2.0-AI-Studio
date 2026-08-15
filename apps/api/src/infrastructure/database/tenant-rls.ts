import { Pool, type PoolClient } from 'pg';

/**
 * MT-02 opção (c) — acesso ao banco com RLS por SESSION-VAR (defesa em profundidade).
 *
 * Ao contrário do `supabaseAdmin` (service_role, BYPASSA a RLS), aqui abrimos uma conexão
 * `pg` por-operação, entramos numa transação, viramos a role `authenticated` e fixamos o
 * tenant num GUC LOCAL (`app.current_tenant`). A migration 096 faz `get_tenant_id()` ler
 * esse GUC como fallback → **a RLS isola por tenant** mesmo que a query esqueça o filtro.
 *
 * Funciona com a AUTH ATUAL (JWT próprio do apps/api) — o tenantId vem do token JÁ
 * verificado; não depende de JWT do Supabase Auth. Gated em `DATABASE_URL`.
 *
 * Uso:
 *   const rows = await withTenantRLS(req.user.tenantId, async (db) => {
 *     const { rows } = await db.query('SELECT id FROM customers'); // RLS já filtra por tenant
 *     return rows;
 *   });
 */

let _pool: Pool | null = null;

export function isTenantRlsAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}

function getPool(): Pool {
  if (_pool) return _pool;
  const dsn = process.env.DATABASE_URL;
  if (!dsn) {
    throw new Error('DATABASE_URL não configurada — withTenantRLS indisponível.');
  }
  _pool = new Pool({ connectionString: dsn, max: 10, application_name: 'astrum-tenant-rls' });
  _pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[tenant-rls] erro ocioso no pool:', err.message);
  });
  return _pool;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Executa `fn` numa transação com o tenant fixado e a RLS valendo.
 * `SET LOCAL ROLE authenticated` garante que a RLS se aplica (a conexão de serviço,
 * como owner/superuser, bypassaria a RLS sem isso — mesmo com FORCE RLS da 092).
 */
export async function withTenantRLS<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new Error('withTenantRLS: tenantId inválido (esperado UUID).');
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    // vira role não-privilegiada → a RLS passa a valer nesta transação
    await client.query('SET LOCAL ROLE authenticated');
    // set_config(..., true) = LOCAL à transação; lido por get_tenant_id() (migration 096)
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* já pode estar abortada */ }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Rollout incremental do MT-02(c). Quando `TENANT_RLS_ROUTES_ENABLED=true` E há
 * `DATABASE_URL`, roda a leitura via `withTenantRLS` (RLS por GUC — **exige a
 * migration 096 aplicada**). Caso contrário, usa o caminho atual (`fallback`,
 * service_role) → **ZERO mudança de comportamento**.
 *
 * ⚠️ Ordem obrigatória p/ ligar: (1) aplicar a 096; (2) rodar o teste de
 * aceitação `tenant-rls.db.test.ts` contra staging (prova isolamento + fail-closed);
 * (3) só então `TENANT_RLS_ROUTES_ENABLED=true`. Ligar ANTES da 096 faz a rota
 * voltar vazia (get_tenant_id() não lê o GUC → RLS nega tudo). Rollback = desligar a flag.
 *
 * Mantemos o filtro `WHERE tenant_id` explícito TAMBÉM no caminho RLS (belt-and-
 * suspenders): a RLS é a rede de defesa-em-profundidade, não a única barreira.
 */
export function isTenantRlsRoutesEnabled(): boolean {
  return (process.env.TENANT_RLS_ROUTES_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export async function readTenantScoped<T>(
  tenantId: string,
  paths: { rls: (client: PoolClient) => Promise<T>; fallback: () => Promise<T> },
): Promise<T> {
  if (isTenantRlsRoutesEnabled() && isTenantRlsAvailable()) {
    return withTenantRLS(tenantId, paths.rls);
  }
  return paths.fallback();
}

/**
 * Igual ao `readTenantScoped`, mas para operações de ESCRITA (INSERT/UPDATE/DELETE).
 * Alias semântico — a lógica é idêntica (mesma flag/DSN). No caminho RLS, a policy
 * `FOR ALL ... USING (tenant_id = get_tenant_id())` das tabelas serve TAMBÉM de
 * `WITH CHECK` (Postgres reusa o USING quando não há WITH CHECK), então INSERT com
 * `tenant_id` de outro tenant é REJEITADO (provado no banco: cross-tenant INSERT →
 * "new row violates row-level security policy"). Defesa em profundidade real na escrita.
 */
export async function writeTenantScoped<T>(
  tenantId: string,
  paths: { rls: (client: PoolClient) => Promise<T>; fallback: () => Promise<T> },
): Promise<T> {
  return readTenantScoped(tenantId, paths);
}

export async function closeTenantRlsPool(): Promise<void> {
  if (!_pool) return;
  const p = _pool;
  _pool = null;
  await p.end();
}
