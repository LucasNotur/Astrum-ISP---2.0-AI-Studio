import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { queues } from '../../infrastructure/queue/priority-queues';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import {
  computeStage,
  overdueDaysOf,
  buildCobraiEnqueue,
  pickSendMessageRule,
  buildCobraiMessage,
  type CobraiStage,
  type CobraiEnqueue,
} from './cobrai-dispatch.service';
import { getTenantCobraiRules } from '../../infrastructure/adapters/cobranca-db.adapter';

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
    let skipped = 0;

    // Régua do tenant (fail-open: [] se a consulta falhar). É daqui que sai a
    // mensagem — sem uma regra `send_message` com template, não há o que enviar,
    // e o job vira no-op no worker (send_message sem message). Por isso só
    // enfileiramos jobs que de fato têm telefone + mensagem (o resto conta em `skipped`).
    const rules = await getTenantCobraiRules(tenantId);

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

      const { data: cust } = await supabaseAdmin
        .from('customers')
        .select('name, phone')
        .eq('id', body.customerId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const overdueDays = inv?.due_date ? overdueDaysOf(inv.due_date, now) : 0;
      const rule = pickSendMessageRule(rules, overdueDays);
      const messageContent = rule?.messageTemplate
        ? buildCobraiMessage(rule.messageTemplate, {
            customerName: cust?.name ?? 'Cliente',
            amountCents: inv?.amount_cents ?? 0,
            invoiceId: inv?.id ?? '',
            overdueDays,
          })
        : undefined;

      if (cust?.phone && messageContent) {
        jobs.push(buildCobraiEnqueue({
          customerId: body.customerId,
          tenantId,
          stage: body.stage ?? (inv?.due_date ? computeStage(inv.due_date, now) : 'D_ZERO'),
          invoiceId: inv?.id,
          amountCents: inv?.amount_cents,
          customerPhone: cust.phone,
          messageContent,
        }));
      } else {
        skipped++;
      }
    } else {
      // Massa: todas as faturas do tenant não-pagas e já vencidas.
      const { data: invoices, error } = await supabaseAdmin
        .from('invoices')
        .select('id, customer_id, amount_cents, due_date')
        .eq('tenant_id', tenantId)
        .neq('status', 'paid')
        .lt('due_date', new Date(now).toISOString());
      if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });

      const rows = (invoices ?? []) as any[];
      const custIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];

      // Clientes: nome + telefone + opt-out numa consulta só (LGPD: pula opt-out).
      const custById = new Map<string, { name?: string; phone?: string; optedOut: boolean }>();
      if (custIds.length) {
        const { data: custs } = await supabaseAdmin
          .from('customers')
          .select('id, name, phone, cobrai_opted_out')
          .eq('tenant_id', tenantId)
          .in('id', custIds);
        for (const c of (custs ?? []) as any[]) {
          custById.set(c.id, { name: c.name, phone: c.phone, optedOut: c.cobrai_opted_out === true });
        }
      }

      for (const r of rows) {
        if (!r.customer_id) continue;
        const cust = custById.get(r.customer_id);
        if (!cust || cust.optedOut) { skipped++; continue; }

        const overdueDays = r.due_date ? overdueDaysOf(r.due_date, now) : 0;
        const rule = pickSendMessageRule(rules, overdueDays);
        const messageContent = rule?.messageTemplate
          ? buildCobraiMessage(rule.messageTemplate, {
              customerName: cust.name ?? 'Cliente',
              amountCents: r.amount_cents ?? 0,
              invoiceId: r.id,
              overdueDays,
            })
          : undefined;

        if (cust.phone && messageContent) {
          jobs.push(buildCobraiEnqueue({
            customerId: r.customer_id,
            tenantId,
            stage: computeStage(r.due_date, now),
            invoiceId: r.id,
            amountCents: r.amount_cents,
            customerPhone: cust.phone,
            messageContent,
          }));
        } else {
          skipped++;
        }
      }
    }

    for (const j of jobs) await (queues.cobrai as any).add(j.name, j.data);
    return reply.send({ ok: true, dispatched: jobs.length, skipped });
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
