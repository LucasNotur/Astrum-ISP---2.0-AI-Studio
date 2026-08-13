import type { FastifyInstance } from 'fastify';
import { redis } from '../../infrastructure/cache/redis.client';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { computeHealthStats } from './whatsapp-health.service';

/**
 * Saúde da conexão WhatsApp (card do WhatsAppPage). Antes o front batia em
 * `/api/whatsapp/health-stats?tenantId=...&instanceId=...` (404 — nunca existiu).
 *
 *   GET /api/v2/whatsapp/health-stats?instanceId=<instância>
 *
 * Tenant vem do JWT (não mais do query). A instância é validada como pertencente
 * ao tenant (`tenant_evolution_instances`) antes de ler os sinais — impede que um
 * operador sonde `ban_signals`/pausas de instâncias de outro tenant.
 */
function tenantOf(req: any): string | undefined {
  return req.user?.tenantId ?? req.user?.tenant_id;
}

export async function whatsappHealthRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/whatsapp/health-stats', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const instanceId = String((req.query as any)?.instanceId ?? '').trim();
    if (!instanceId) {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'instanceId é obrigatório.' });
    }

    // Defesa em profundidade: a instância tem de ser deste tenant.
    const { data: owned, error: ownErr } = await supabaseAdmin
      .from('tenant_evolution_instances')
      .select('instance_name')
      .eq('tenant_id', tenantId)
      .eq('instance_name', instanceId)
      .maybeSingle();

    if (ownErr) return reply.code(500).send({ code: 'DB_ERROR', message: ownErr.message });
    if (!owned) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Instância não encontrada para este tenant.' });

    const stats = await computeHealthStats(tenantId, instanceId, {
      get: (k) => (redis as any).get(k),
      exists: (k) => (redis as any).exists(k),
      queueWaiting: async () => {
        const { messageQueue } = await import('../../../../../packages/queue/src/queues');
        const q = messageQueue as any;
        return typeof q.getWaitingCount === 'function' ? await q.getWaitingCount() : 0;
      },
    });

    return stats;
  });
}
