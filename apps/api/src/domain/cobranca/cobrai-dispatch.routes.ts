import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { queues } from '../../infrastructure/queue/priority-queues';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import {
  computeStage,
  buildCobraiEnqueue,
  type CobraiStage,
  type CobraiEnqueue,
} from './cobrai-dispatch.service';

function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

/**
 * Disparo manual da régua CobrAI + gestão da fila (FASE 2-A.4, port do Express /api/cobrai).
 *
 * Gate: `billing:write` (admin/super_admin) — dispara/mexe em cobrança REAL, não é ação de
 * operador comum. Monitor read-only (queue-stats/queue) fica em `authenticate` (queue-monitor.routes).
 */
export async function cobraiDispatchRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];
  const canWrite = [requirePermission('billing', 'write')];

  // POST /api/v2/cobranca/send-now  { customerId?, stage? }
  //  - com customerId → disparo avulso (1 cliente); sem → rotina em massa (todas as faturas vencidas).
  app.post('/api/v2/cobranca/send-now', { onRequest: auth, preHandler: canWrite }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const body = (req.body ?? {}) as { customerId?: string; stage?: CobraiStage };
    const now = Date.now();
    const jobs: CobraiEnqueue[] = [];

    if (body.customerId) {
      // Fatura vencida mais antiga do cliente (p/ invoiceId/valor/estágio quando não vier stage).
      const { data: inv } = await supabaseAdmin
        .from('invoices')
        .select('id, amount_cents, due_date')
        .eq('tenant_id', tenantId)
        .eq('customer_id', body.customerId)
        .neq('status', 'paid')
        .order('due_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      const stage: CobraiStage = body.stage ?? (inv?.due_date ? computeStage(inv.due_date, now) : 'D_ZERO');
      jobs.push(buildCobraiEnqueue({
        customerId: body.customerId,
        tenantId,
        stage,
        invoiceId: inv?.id,
        amountCents: inv?.amount_cents,
      }));
    } else {
      // Massa: todas as faturas do tenant não-pagas e já vencidas.
      const { data: invoices, error } = await supabaseAdmin
        .from('invoices')
        .select('id, customer_id, amount_cents, due_date')
        .eq('tenant_id', tenantId)
        .neq('status', 'paid')
        .lt('due_date', new Date(now).toISOString());
      if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });

      const rows = invoices ?? [];
      const custIds = [...new Set(rows.map((r: any) => r.customer_id).filter(Boolean))];

      // Respeita opt-out (LGPD/preferência): pula clientes com cobrai_opted_out=true.
      const optedOut = new Set<string>();
      if (custIds.length) {
        const { data: opted } = await supabaseAdmin
          .from('customers')
          .select('id')
          .eq('tenant_id', tenantId)
          .in('id', custIds)
          .eq('cobrai_opted_out', true);
        for (const c of opted ?? []) optedOut.add(c.id);
      }

      for (const r of rows as any[]) {
        if (!r.customer_id || optedOut.has(r.customer_id)) continue;
        jobs.push(buildCobraiEnqueue({
          customerId: r.customer_id,
          tenantId,
          stage: computeStage(r.due_date, now),
          invoiceId: r.id,
          amountCents: r.amount_cents,
        }));
      }
    }

    for (const j of jobs) await (queues.cobrai as any).add(j.name, j.data);
    return reply.send({ ok: true, dispatched: jobs.length });
  });

  // DELETE /api/v2/cobranca/queue/:id — remove um job da fila cobrai (ownership por tenant).
  app.delete('/api/v2/cobranca/queue/:id', { onRequest: auth, preHandler: canWrite }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { id } = req.params as { id: string };
    const job = await (queues.cobrai as any).getJob(id);
    if (!job) return reply.code(404).send({ code: 'NOT_FOUND' });
    // Isolamento: um ISP não pode remover job de cobrança de outro tenant.
    if (job.data?.tenantId !== tenantId) return reply.code(403).send({ code: 'FORBIDDEN' });

    await job.remove();
    return reply.send({ ok: true });
  });
}
