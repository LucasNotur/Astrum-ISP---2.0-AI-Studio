import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { resolveTenantKeys } from '../../lib/tenant-keys';
import { buildEvolutionTarget } from './evolution-proxy.service';
import { checkWhatsAppConnectionHealth } from './whatsapp-connection-health.service';

function tenantOf(req: any): string | undefined {
  return req.user?.tenantId ?? req.user?.tenant_id;
}

/** tenant_evolution_instances (1ª linha) → tenants.evolution_instance (single legado). */
async function resolveInstance(tenantId: string): Promise<string | null> {
  const { data: row } = await supabaseAdmin
    .from('tenant_evolution_instances')
    .select('instance_name')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (row?.instance_name) return row.instance_name;

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('evolution_instance')
    .eq('id', tenantId)
    .maybeSingle();
  return tenant?.evolution_instance ?? null;
}

async function pingConnectionState(evolutionUrl: string, apikey: string, instance: string): Promise<unknown> {
  const target = buildEvolutionTarget(evolutionUrl, `/instance/connectionState/${encodeURIComponent(instance)}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(target, { method: 'GET', headers: { apikey }, signal: controller.signal });
    if (!res.ok) throw new Error(`Evolution respondeu ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * GET /api/v2/whatsapp/health — substitui o stub `/api/health/whatsapp` (Express raiz),
 * que sempre retornava `{status:"open"}` sem checar nada. Ver whatsapp-connection-health.service.ts
 * para a decisão de fonte de dados.
 */
export async function whatsappConnectionHealthRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/whatsapp/health', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const result = await checkWhatsAppConnectionHealth(tenantId, {
      resolveInstance,
      resolveKeys: resolveTenantKeys,
      pingConnectionState,
    });
    return reply.send(result);
  });
}

export default whatsappConnectionHealthRoutes;
