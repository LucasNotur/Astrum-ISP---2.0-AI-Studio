/**
 * GET /api/v2/observability/synthetic-probes — últimas probes da sonda
 * sintética 24/7 (super_admin). Alimenta a seção "Sonda Sintética" do
 * HealthDashboardPage.tsx. Ver synthetic-monitor.ports.ts e migration 125.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUserId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../database/supabase.client';
import { securityLogger } from '../logging/logger';

interface JwtUserPayload {
  userId?: string;
  role?: string;
}

async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ userId: string } | null> {
  const user = (request as unknown as { user?: JwtUserPayload }).user;
  const userId = getUserId(user);
  if (!userId) {
    await reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Autenticação necessária.' });
    return null;
  }

  const { data, error } = await supabaseAdmin.from('users').select('role').eq('id', userId).maybeSingle();
  if (error || !data || data.role !== 'super_admin') {
    securityLogger.warn(
      { userId, dbRole: data?.role ?? null },
      'synthetic-probes: tentativa de acesso sem super_admin',
    );
    await reply.status(403).send({ code: 'FORBIDDEN', message: 'Acesso restrito a super_admin.' });
    return null;
  }
  return { userId };
}

const PROBE_LIMIT = 20;

export async function syntheticMonitorRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/observability/synthetic-probes', { onRequest: auth }, async (request, reply) => {
    const authed = await requireSuperAdmin(request, reply);
    if (!authed) return;

    const { data, error } = await supabaseAdmin
      .from('synthetic_probe_results')
      .select('tenant_id, success, latency_ms, probed_at')
      .order('probed_at', { ascending: false })
      .limit(PROBE_LIMIT);

    if (error) {
      return reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Falha ao consultar probes.' });
    }

    return reply.send({
      probes: (data ?? []).map((row) => ({
        tenantId: row.tenant_id,
        timestamp: row.probed_at,
        success: row.success,
        latencyMs: row.latency_ms,
      })),
    });
  });
}
