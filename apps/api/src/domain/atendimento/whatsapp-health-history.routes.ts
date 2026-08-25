import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

/**
 * Histórico de saúde WhatsApp (migration 105 — `whatsapp_health_snapshots`).
 *
 *   GET /api/v2/whatsapp/health-history?instanceId=<instância>&hours=<1..168, default 24>
 *
 * Complementa o card ao vivo (`health-stats`) com a série temporal gravada pelo
 * worker de snapshot, permitindo ler tendência (ex.: ban_signals subindo ao
 * longo do dia). Mesmo guard de segurança do health-stats: a instância TEM de
 * pertencer ao tenant do JWT antes de qualquer leitura — impede que um operador
 * veja o histórico de banimento de outro tenant.
 */
function tenantOf(req: any): string | null {
  return getTenantId(req.user);
}

const MAX_HOURS = 168;
const DEFAULT_HOURS = 24;

export async function whatsappHealthHistoryRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/whatsapp/health-history', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const instanceId = String((req.query as any)?.instanceId ?? '').trim();
    if (!instanceId) {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'instanceId é obrigatório.' });
    }

    const hoursRaw = parseInt(String((req.query as any)?.hours ?? ''), 10);
    const hours = Number.isFinite(hoursRaw) && hoursRaw > 0
      ? Math.min(hoursRaw, MAX_HOURS)
      : DEFAULT_HOURS;

    // Defesa em profundidade: a instância tem de ser deste tenant (mesmo guard do health-stats).
    const { data: owned, error: ownErr } = await supabaseAdmin
      .from('tenant_evolution_instances')
      .select('instance_name')
      .eq('tenant_id', tenantId)
      .eq('instance_name', instanceId)
      .maybeSingle();

    if (ownErr) return reply.code(500).send({ code: 'DB_ERROR', message: ownErr.message });
    if (!owned) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Instância não encontrada para este tenant.' });

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('whatsapp_health_snapshots')
      .select('created_at, ban_signals, is_paused, daily_messages_today, messages_in_queue, risk_level')
      .eq('tenant_id', tenantId)
      .eq('instance_id', instanceId)
      .gte('created_at', since)
      .order('created_at', { ascending: true });

    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });

    return data ?? [];
  });
}
