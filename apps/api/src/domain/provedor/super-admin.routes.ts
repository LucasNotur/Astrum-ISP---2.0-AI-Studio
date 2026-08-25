/**
 * F1-D — SuperAdminPage batia direto no Supabase (client anônimo, bloqueado pela
 * migration 092) pra listar/editar tenants, shadow_results e tenant_feature_flags.
 *
 * Exceção deliberada às regras de tenant-scoping da Fase 1: estas rotas são o
 * painel cross-tenant do super_admin (gerenciam TODOS os tenants), então não
 * filtram por `tenant_id` do requester — são gateadas só por `role === 'super_admin'`
 * via `requirePermission('reports', 'admin')` (mesmo padrão de dlq.routes.ts).
 */
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';

export async function superAdminRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];
  const superAdminOnly = [requirePermission('reports', 'admin')];

  // GET /api/v2/super-admin/tenants
  app.get('/api/v2/super-admin/tenants', { onRequest: auth, preHandler: superAdminOnly }, async (_req, reply) => {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id,name,plan,active,subscriber_count,atendimento_engine')
      .limit(100);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // PUT /api/v2/super-admin/tenants/:id — active e/ou atendimento_engine.
  app.put('/api/v2/super-admin/tenants/:id', { onRequest: auth, preHandler: superAdminOnly }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as { active?: boolean; atendimento_engine?: string | null }) ?? {};
    const patch: Record<string, unknown> = {};
    if (typeof body.active === 'boolean') patch.active = body.active;
    if ('atendimento_engine' in body) patch.atendimento_engine = body.atendimento_engine;
    if (Object.keys(patch).length === 0) return reply.code(400).send({ code: 'BAD_REQUEST', message: 'Nada para atualizar' });

    const { error } = await supabaseAdmin.from('tenants').update(patch).eq('id', id);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });

  // GET /api/v2/super-admin/shadow-results
  app.get('/api/v2/super-admin/shadow-results', { onRequest: auth, preHandler: superAdminOnly }, async (_req, reply) => {
    const { data, error } = await supabaseAdmin
      .from('shadow_results')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // GET /api/v2/super-admin/feature-flags
  app.get('/api/v2/super-admin/feature-flags', { onRequest: auth, preHandler: superAdminOnly }, async (_req, reply) => {
    const { data, error } = await supabaseAdmin
      .from('tenant_feature_flags')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // PUT /api/v2/super-admin/feature-flags — upsert (tenantId, flag, enabled).
  app.put('/api/v2/super-admin/feature-flags', { onRequest: auth, preHandler: superAdminOnly }, async (req, reply) => {
    const body = (req.body as { tenantId?: string; flag?: string; enabled?: boolean }) ?? {};
    if (!body.tenantId || !body.flag || typeof body.enabled !== 'boolean') {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'tenantId, flag e enabled são obrigatórios' });
    }
    const { error } = await supabaseAdmin
      .from('tenant_feature_flags')
      .upsert({ tenant_id: body.tenantId, flag: body.flag, enabled: body.enabled }, { onConflict: 'tenant_id,flag' });
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });
}
