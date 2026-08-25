/**
 * F1-B — TeamPage batia direto no Supabase com o client anônimo pra CRUD de
 * colaboradores e métricas de performance/ranking (bloqueado pela migration
 * 092_p0_rls_hardening.sql). Estas rotas servem os mesmos dados via
 * `supabaseAdmin`, filtrando por tenant do JWT. Escritas exigem `users:write`
 * (só admin/super_admin no RBAC atual — não há ação `delete` própria pra
 * `users`, então DELETE usa o mesmo gate de `write`).
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';

function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

export async function teamPageRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];
  const canWrite = [requirePermission('users', 'write')];

  // GET /api/v2/team/members — lista os colaboradores do tenant (painel ao vivo + tabela).
  app.get('/api/v2/team/members', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('team_members')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // GET /api/v2/team/operator-status — presença/status ao vivo (TopHeader.tsx, F1-D2).
  // `tenants.operators` é JSONB real, mesmo storage que o backend já usa. Só leitura —
  // a escrita (upsertTenantOperator, src/lib/supabaseDb.ts) e a assinatura Realtime
  // ficam fora do escopo desta rota (mesmo limite já registrado pela F1-INV para
  // `src/lib/*`).
  app.get('/api/v2/team/operator-status', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('operators')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ operators: Array.isArray(data?.operators) ? data.operators : [] });
  });

  // POST /api/v2/team/members — cria novo colaborador.
  app.post('/api/v2/team/members', {
    onRequest: auth,
    preHandler: canWrite,
  }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { name, email, role, status } = (req.body ?? {}) as Record<string, any>;
    const { data, error } = await supabaseAdmin
      .from('team_members')
      .insert({ name, email, role, status, tenant_id: tenantId })
      .select('id')
      .single();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.code(201).send({ id: (data as any).id });
  });

  // PUT /api/v2/team/members/:id — atualiza colaborador existente.
  app.put('/api/v2/team/members/:id', {
    onRequest: auth,
    preHandler: canWrite,
  }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { id } = req.params as { id: string };
    const { name, email, role, status } = (req.body ?? {}) as Record<string, any>;
    const { error } = await supabaseAdmin
      .from('team_members')
      .update({ name, email, role, status })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });

  // DELETE /api/v2/team/members/:id — remove colaborador.
  app.delete('/api/v2/team/members/:id', {
    onRequest: auth,
    preHandler: canWrite,
  }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { id } = req.params as { id: string };
    const { error } = await supabaseAdmin
      .from('team_members')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });

  // GET /api/v2/team/performance — tickets do mês corrente por assigned_to (aba Visão Geral).
  app.get('/api/v2/team/performance', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const currentMonth = new Date().toISOString().substring(0, 7);
    const { data, error } = await supabaseAdmin
      .from('tickets')
      .select('assigned_to,created_at,updated_at,status')
      .eq('tenant_id', tenantId)
      .gte('created_at', `${currentMonth}-01`);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // GET /api/v2/team/ranking — tickets resolvidos no mês por agente (aba Ranking/Game).
  app.get('/api/v2/team/ranking', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const currentMonth = new Date().toISOString().substring(0, 7);
    const { data, error } = await supabaseAdmin
      .from('tickets')
      .select('assigned_to,status,created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'resolved')
      .gte('created_at', `${currentMonth}-01`);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });
}
