import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
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
    const { data, error } = await supabaseAdmin
      .from('dead_letter_queue')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('resolved', false)
      .order('failed_at', { ascending: false });
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // POST /api/v2/dlq/:id/retry → reenfileira + marca resolvido.
  app.post('/api/v2/dlq/:id/retry', { onRequest: auth, preHandler: admin }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { id } = req.params as { id: string };

    const { data: row } = await supabaseAdmin
      .from('dead_letter_queue').select('*')
      .eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (!row) return reply.code(404).send({ code: 'NOT_FOUND' });

    const t = resolveRetryTarget(row);
    if (t.queue === 'cobrai') await (queues.cobrai as any).add(t.jobName, t.payload);
    else await enqueueMessage(t.tenantId ?? tenantId, t.payload, {}, t.jobName);

    const userId = (req as any).user?.userId ?? (req as any).user?.sub ?? null;
    await supabaseAdmin.from('dead_letter_queue')
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: userId })
      .eq('id', id).eq('tenant_id', tenantId);

    return reply.send({ ok: true });
  });
}
