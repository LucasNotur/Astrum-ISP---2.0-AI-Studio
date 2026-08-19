import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { readTenantScoped, writeTenantScoped } from '../../infrastructure/database/tenant-rls';
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

    try {
      // MT-02(c): RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
      const templates = await readTenantScoped(tenantId, {
        rls: async (db) => {
          const { rows } = await db.query(
            `SELECT * FROM hsm_templates WHERE tenant_id = $1 ORDER BY created_at DESC`,
            [tenantId],
          );
          return rows;
        },
        fallback: async () => {
          const { data, error } = await supabaseAdmin
            .from('hsm_templates')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });
          if (error) throw new Error(error.message);
          return data ?? [];
        },
      });
      return reply.send(templates);
    } catch (err) {
      return reply.code(500).send({ code: 'DB_ERROR', message: (err as Error).message });
    }
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
      // MT-02(c): escrita RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
      const inserted = await writeTenantScoped(tenantId, {
        rls: async (db) => {
          const { rows } = await db.query(
            `INSERT INTO hsm_templates (tenant_id, name, category, language, header_type, header_content, body, footer, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [row.tenant_id, row.name, row.category, row.language, row.header_type, row.header_content, row.body, row.footer, row.status],
          );
          return rows[0];
        },
        fallback: async () => {
          const { data, error } = await supabaseAdmin.from('hsm_templates').insert(row).select().single();
          if (error) throw error; // preserva error.code=23505 pro catch de fora tratar
          return data;
        },
      });
      return reply.code(201).send(inserted);
    } catch (e) {
      if (e instanceof HsmTemplateValidationError) {
        return reply.code(400).send({ code: 'BAD_REQUEST', message: e.message });
      }
      if ((e as any)?.code === '23505') {
        return reply.code(409).send({ code: 'DUPLICATE', message: 'Já existe um template com esse nome+idioma' });
      }
      return reply.code(500).send({ code: 'DB_ERROR', message: (e as Error).message });
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

    // MT-02(c): leitura RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
    const row = await readTenantScoped(tenantId, {
      rls: async (db) => {
        const { rows } = await db.query(
          `SELECT status FROM hsm_templates WHERE id = $1 AND tenant_id = $2`,
          [id, tenantId],
        );
        return rows[0] ?? null;
      },
      fallback: async () => {
        const { data } = await supabaseAdmin
          .from('hsm_templates')
          .select('status')
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        return data ?? null;
      },
    });

    if (!row) return reply.code(404).send({ code: 'NOT_FOUND' });
    if (!canDeleteTemplate(row.status)) {
      return reply.code(403).send({ code: 'APPROVED_TEMPLATE', message: 'Não é possível excluir um template aprovado' });
    }

    // MT-02(c): escrita RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
    try {
      await writeTenantScoped(tenantId, {
        rls: async (db) => {
          await db.query(
            `DELETE FROM hsm_templates WHERE id = $1 AND tenant_id = $2`,
            [id, tenantId],
          );
        },
        fallback: async () => {
          const { error } = await supabaseAdmin.from('hsm_templates').delete().eq('id', id).eq('tenant_id', tenantId);
          if (error) throw new Error(error.message);
        },
      });
    } catch (err) {
      return reply.code(500).send({ code: 'DB_ERROR', message: (err as Error).message });
    }
    return reply.send({ ok: true });
  });
}
