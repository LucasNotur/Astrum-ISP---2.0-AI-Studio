/**
 * F1-D2 — SecurityPage batia direto no Supabase com o client anônimo pra listar
 * `audit_log` (bloqueado pela migration 092_p0_rls_hardening.sql). Colunas reais
 * conferidas via MCP: id, tenant_id, user_id, action, resource, resource_id,
 * ip_address, user_agent, metadata, created_at.
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

export async function auditLogRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // GET /api/v2/security/audit-log — últimas 500 entradas do tenant.
  app.get('/api/v2/security/audit-log', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = getTenantId(req.user);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const { data, error } = await supabaseAdmin
      .from('audit_log')
      .select('id, user_id, action, resource, resource_id, ip_address, metadata, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });
}
