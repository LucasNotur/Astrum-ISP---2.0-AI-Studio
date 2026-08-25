import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { readTenantScoped, writeTenantScoped } from '../../infrastructure/database/tenant-rls';
import { queues } from '../../infrastructure/queue/priority-queues';
import { enqueueMessage } from '../../infrastructure/queue/bullmq.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { resolveRetryTarget } from './dlq.service';

function tenantOf(req: any): string | undefined { return req.user?.tenantId ?? req.user?.tenant_id; }

export async function dlqRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];
  // super_admin-only (paridade com o verifySuperAdmin do legado). reports:admin só o super_admin tem.
  const admin = [requirePermission('reports', 'admin')];

  // GET /api/v2/dlq → jobs mortos não resolvidos do tenant.
  app.get('/api/v2/dlq', { onRequest: auth, preHandler: admin }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    try {
      // MT-02(c): RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
      const jobs = await readTenantScoped(tenantId, {
        rls: async (db) => {
          const { rows } = await db.query(
            `SELECT * FROM dead_letter_queue WHERE tenant_id = $1 AND resolved = false ORDER BY failed_at DESC`,
            [tenantId],
          );
          return rows;
        },
        fallback: async () => {
          const { data, error } = await supabaseAdmin
            .from('dead_letter_queue')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('resolved', false)
            .order('failed_at', { ascending: false });
          if (error) throw new Error(error.message);
          return data ?? [];
        },
      });
      return reply.send(jobs);
    } catch (err) {
      return reply.code(500).send({ code: 'DB_ERROR', message: (err as Error).message });
    }
  });

  // POST /api/v2/dlq/:id/retry → reenfileira + marca resolvido.
  app.post('/api/v2/dlq/:id/retry', { onRequest: auth, preHandler: admin }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { id } = req.params as { id: string };

    // MT-02(c): leitura RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
    const row = await readTenantScoped(tenantId, {
      rls: async (db) => {
        const { rows } = await db.query(
          `SELECT * FROM dead_letter_queue WHERE id = $1 AND tenant_id = $2`,
          [id, tenantId],
        );
        return rows[0] ?? null;
      },
      fallback: async () => {
        const { data } = await supabaseAdmin
          .from('dead_letter_queue').select('*')
          .eq('id', id).eq('tenant_id', tenantId).maybeSingle();
        return data ?? null;
      },
    });
    if (!row) return reply.code(404).send({ code: 'NOT_FOUND' });

    const t = resolveRetryTarget(row);
    if (t.queue === 'cobrai') await (queues.cobrai as any).add(t.jobName, t.payload);
    else await enqueueMessage(t.tenantId ?? tenantId, t.payload, {}, t.jobName);

    const userId = (req as any).user?.userId ?? (req as any).user?.sub ?? null;
    // MT-02(c): escrita RLS por-tenant quando a flag está ligada (pós-096); senão service_role.
    await writeTenantScoped(tenantId, {
      rls: async (db) => {
        await db.query(
          `UPDATE dead_letter_queue SET resolved = true, resolved_at = $1, resolved_by = $2 WHERE id = $3 AND tenant_id = $4`,
          [new Date().toISOString(), userId, id, tenantId],
        );
      },
      fallback: async () => {
        await supabaseAdmin.from('dead_letter_queue')
          .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: userId })
          .eq('id', id).eq('tenant_id', tenantId);
      },
    });

    return reply.send({ ok: true });
  });

  // POST /api/v2/dlq/:id/discard → marca resolvido SEM reenfileirar (F1-D — MonitoringPage).
  app.post('/api/v2/dlq/:id/discard', { onRequest: auth, preHandler: admin }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { id } = req.params as { id: string };
    const { reason } = (req.body as { reason?: string }) ?? {};

    const userId = (req as any).user?.userId ?? (req as any).user?.sub ?? null;
    const { data, error } = await supabaseAdmin
      .from('dead_letter_queue')
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: userId, notes: reason ?? 'descartado' })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('id')
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    if (!data) return reply.code(404).send({ code: 'NOT_FOUND' });

    return reply.send({ ok: true });
  });
}
