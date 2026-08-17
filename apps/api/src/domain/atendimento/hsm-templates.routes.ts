import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { buildHsmTemplateRow, canDeleteTemplate, HsmTemplateValidationError } from './hsm-templates.service';

function tenantOf(req: any): string | undefined {
  return req.user?.tenantId ?? req.user?.tenant_id;
}

export async function hsmTemplatesRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // GET /api/v2/hsm-templates — lista os templates do tenant (do JWT, nunca de query).
  app.get('/api/v2/hsm-templates', {
    onRequest: auth,
    preHandler: [requirePermission('whatsapp_templates', 'read')],
  }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('hsm_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // POST /api/v2/hsm-templates — cria template (nasce PENDING).
  app.post('/api/v2/hsm-templates', {
    onRequest: auth,
    preHandler: [requirePermission('whatsapp_templates', 'write')],
  }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    try {
      const row = buildHsmTemplateRow(tenantId, req.body);
      const { data, error } = await supabaseAdmin.from('hsm_templates').insert(row).select().single();
      if (error) {
        if ((error as any).code === '23505') {
          return reply.code(409).send({ code: 'DUPLICATE', message: 'Já existe um template com esse nome+idioma' });
        }
        return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
      }
      return reply.code(201).send(data);
    } catch (e) {
      if (e instanceof HsmTemplateValidationError) {
        return reply.code(400).send({ code: 'BAD_REQUEST', message: e.message });
      }
      throw e;
    }
  });

  // DELETE /api/v2/hsm-templates/:id — bloqueia exclusão de template já aprovado (paridade legado).
  app.delete('/api/v2/hsm-templates/:id', {
    onRequest: auth,
    preHandler: [requirePermission('whatsapp_templates', 'write')],
  }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { id } = req.params as { id: string };

    const { data: row } = await supabaseAdmin
      .from('hsm_templates')
      .select('status')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!row) return reply.code(404).send({ code: 'NOT_FOUND' });
    if (!canDeleteTemplate(row.status)) {
      return reply.code(403).send({ code: 'APPROVED_TEMPLATE', message: 'Não é possível excluir um template aprovado' });
    }

    const { error } = await supabaseAdmin.from('hsm_templates').delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send({ ok: true });
  });
}
