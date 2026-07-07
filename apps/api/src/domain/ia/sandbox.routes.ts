/**
 * IA-44 — Sandbox SQL do agente.
 *
 * POST /api/v2/ia/sandbox/query
 *
 * Defesa em profundidade:
 *  1. Auth: JWT válido + role=super_admin (mesmo padrão do Sidebar —
 *     consulta `users` table no banco; protege contra JWT stale em que
 *     o usuário foi rebaixado depois da emissão).
 *  2. Flag de feature: `AGENT_SANDBOX_ENABLED` deve estar ON (default OFF).
 *  3. SQL Guard: `validateSql()` no AST (recusa DML/DDL, multi-statement,
 *     funções perigosas, tabelas fora da allowlist; injeta LIMIT 500 e
 *     WHERE tenant_id = $1).
 *  4. Execução: pool Postgres dedicado com role `agent_readonly`
 *     (statement_timeout=3s, default_transaction_read_only=on).
 *  5. Auditoria: cada query vai para `sandbox_queries` com tenant/user/ms/rows.
 *
 * Respostas:
 *  - 200 { columns, rows, ms }
 *  - 400 { error, hint } — SqlGuardError
 *  - 401 — token ausente/inválido
 *  - 403 — não é super_admin, ou flag off
 *  - 503 — SANDBOX_DB_URL ausente (fail-open)
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { validateSql, SqlGuardError } from '../../infrastructure/sandbox/sql-guard';
import {
  executeQuery,
  isSandboxConfigured,
  SandboxDbError,
} from '../../infrastructure/sandbox/sandbox-db.service';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { securityLogger } from '../../infrastructure/logging/logger';

interface SandboxBody {
  sql?: unknown;
}

interface JwtUserPayload {
  userId?: string;
  tenantId?: string;
  role?: string;
}

async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ userId: string; tenantId: string } | null> {
  const user = (request as unknown as { user?: JwtUserPayload }).user;
  const userId = user?.userId;
  if (!userId) {
    await reply.status(401).send({
      code: 'UNAUTHORIZED',
      message: 'Autenticação necessária.',
    });
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data || data.role !== 'super_admin') {
    securityLogger.warn(
      { userId, dbRole: data?.role ?? null, jwtRole: user?.role },
      'IA-44: tentativa de acesso ao sandbox sem super_admin',
    );
    await reply.status(403).send({
      code: 'FORBIDDEN',
      message: 'Acesso restrito a super_admin.',
    });
    return null;
  }

  return { userId, tenantId: user.tenantId ?? '' };
}

export async function sandboxRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: SandboxBody }>(
    '/api/v2/ia/sandbox/query',
    {
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      // 1. Auth de role.
      const auth = await requireSuperAdmin(request, reply);
      if (!auth) return;

      // 2. Fail-open: flag off → 403 explícito.
      if ((process.env.AGENT_SANDBOX_ENABLED ?? '').trim().toLowerCase() !== 'true') {
        return reply.status(403).send({
          code: 'SANDBOX_DISABLED',
          message: 'Sandbox do agente desabilitado (AGENT_SANDBOX_ENABLED=false).',
        });
      }

      // 3. Fail-open: DB não configurado → 503.
      if (!isSandboxConfigured()) {
        return reply.status(503).send({
          code: 'SANDBOX_UNAVAILABLE',
          message: 'SANDBOX_DB_URL não configurada. Sandbox desabilitado neste ambiente.',
        });
      }

      // 4. Body.
      const sql = typeof request.body?.sql === 'string' ? request.body.sql : null;
      if (!sql) {
        return reply.status(400).send({
          error: 'Body inválido.',
          hint: 'Envie `{ "sql": "SELECT ..." }` no corpo da requisição.',
        });
      }

      // 5. SQL guard.
      let cleanSql: string;
      try {
        const result = validateSql(sql);
        cleanSql = result.sql;
      } catch (e) {
        if (e instanceof SqlGuardError) {
          return reply.status(400).send({
            error: e.message,
            hint: e.hint,
          });
        }
        throw e;
      }

      // 6. Execução.
      try {
        const params = cleanSql.includes('$1') ? [auth.tenantId] : [];
        const out = await executeQuery(auth.tenantId, auth.userId, cleanSql, params);
        return reply.status(200).send({
          columns: out.columns,
          rows: out.rows,
          ms: out.ms,
        });
      } catch (e) {
        if (e instanceof SandboxDbError) {
          return reply.status(500).send({
            error: 'Falha ao executar a consulta no sandbox.',
            hint: 'Tente simplificar a query ou reduzir o volume de dados.',
          });
        }
        throw e;
      }
    },
  );

  // GET /api/v2/ia/sandbox/history
  fastify.get(
    '/api/v2/ia/sandbox/history',
    {
      onRequest: [fastify.authenticate],
    },
    async (request, reply) => {
      const auth = await requireSuperAdmin(request, reply);
      if (!auth) return;

      if (!isSandboxConfigured()) {
        return reply.status(503).send({ queries: [] });
      }

      const { data, error } = await supabaseAdmin
        .from('sandbox_queries')
        .select('id, sql_text, rows, ms, executed_at')
        .eq('user_id', auth.userId)
        .order('executed_at', { ascending: false })
        .limit(20);

      if (error) {
        return reply.status(500).send({ error: 'Falha ao listar histórico.' });
      }
      return reply.status(200).send({ queries: data ?? [] });
    },
  );
}
