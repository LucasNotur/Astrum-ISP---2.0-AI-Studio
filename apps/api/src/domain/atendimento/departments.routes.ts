import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { sanitizeDepartmentInput } from './departments.service';

/**
 * Departamentos de atendimento — CRUD (migration 097).
 *
 *   GET    /api/v2/departments        — lista os departamentos do tenant
 *   POST   /api/v2/departments        — cria
 *   PUT    /api/v2/departments/:id     — atualiza
 *   DELETE /api/v2/departments/:id     — remove
 *
 * Antes: front lia de `tenants.departments` (coluna inexistente → vazio) e escrevia
 * em `/api/departments` (Express não montava → 404). Feature quebrada; agora funciona.
 * Tenant SEMPRE do JWT (nunca do body/query). Toda query filtra por tenant_id.
 */
const SELECT_COLS = 'id, name, sla_response_minutes, sla_resolution_hours, required_skills, color, routing_mode, created_at';

function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

export async function departmentsRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/departments', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('departments')
      .select(SELECT_COLS)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return { departments: data ?? [] };
  });

  app.post('/api/v2/departments', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    let input;
    try { input = sanitizeDepartmentInput(req.body); }
    catch (e: any) { return reply.code(400).send({ code: 'BAD_REQUEST', message: e.message }); }

    const { data, error } = await supabaseAdmin
      .from('departments')
      .insert({ tenant_id: tenantId, ...input })
      .select('id')
      .single();

    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.code(201).send({ id: data.id });
  });

  app.put<{ Params: { id: string } }>('/api/v2/departments/:id', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    let input;
    try { input = sanitizeDepartmentInput(req.body); }
    catch (e: any) { return reply.code(400).send({ code: 'BAD_REQUEST', message: e.message }); }

    const { error } = await supabaseAdmin
      .from('departments')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', tenantId);

    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/v2/departments/:id', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { error } = await supabaseAdmin
      .from('departments')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', tenantId);

    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return { ok: true };
  });
}
