import type { FastifyInstance } from 'fastify';
import { getTenantId, getUserId } from '../../lib/jwt-claims';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { buildUnmaskAudit, UnmaskValidationError } from './unmask.service';

/**
 * Reveal auditado de PII (MaskedSensitiveData). Antes o front batia em
 * `/api/unmask` (404):
 *
 *   POST /api/v2/security/unmask  { value, type, reason }  → { success, value }
 *
 * Autenticado (operador + tenant do JWT). Grava trilha em `audit_log` (imutável,
 * migration 095) via service_role — SEM o PII cru (só hash + hint). Ecoa o valor
 * de volta (a máscara é client-side; o browser já tinha o dado).
 */
function actorOf(req: any): { tenantId?: string; userId?: string } {
  const u = req.user ?? {};
  return { tenantId: getTenantId(u) ?? undefined, userId: getUserId(u) ?? undefined };
}

export async function unmaskRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.post('/api/v2/security/unmask', { onRequest: auth }, async (req, reply) => {
    const { tenantId, userId } = actorOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });

    const body = (req.body ?? {}) as any;

    let audit;
    try {
      audit = buildUnmaskAudit({ value: body.value, type: body.type, reason: body.reason });
    } catch (e: any) {
      if (e instanceof UnmaskValidationError) {
        return reply.code(400).send({ success: false, error: e.message });
      }
      throw e;
    }

    try {
      await supabaseAdmin.from('audit_log').insert({
        tenant_id: tenantId,
        user_id: userId ?? null,
        action: 'pii_unmask',
        resource: audit.resource,
        resource_id: null,
        ip_address: req.ip,
        user_agent: (req.headers as any)['user-agent'] ?? null,
        metadata: audit.metadata,
      });
    } catch (e: any) {
      // Fail-closed: se a auditoria não grava, NÃO revela (o ponto todo do endpoint
      // é a accountability). Diferente do expunge, aqui nada irreversível aconteceu.
      return reply.code(500).send({ success: false, error: 'Falha ao registrar auditoria; reveal negado.' });
    }

    return { success: true, value: body.value };
  });
}
