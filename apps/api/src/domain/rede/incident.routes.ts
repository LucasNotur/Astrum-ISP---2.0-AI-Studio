/**
 * D-04 — Rotas do NOC autônomo (incidentes).
 * GET   /api/v2/rede/incidents               → lista
 * POST  /api/v2/rede/incidents/scan          → detecta anomalias e abre suspeitas
 * PATCH /api/v2/rede/incidents/:id/confirm   → confirma (mede afetados)
 * PATCH /api/v2/rede/incidents/:id/communicate → notifica afetados (P1-02) — gate humano
 * PATCH /api/v2/rede/incidents/:id/normalize | /cancel
 */
import type { FastifyInstance } from 'fastify';
import supabase from '../../infrastructure/database/supabase.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import {
  isNocAutonomoEnabled,
  scanForIncidents,
  transitionIncident,
  communicateIncident,
} from './incident-orchestrator.service';

export async function incidentRoutes(app: FastifyInstance) {
  app.get('/api/v2/rede/incidents', {
    preHandler: [app.authenticate, requirePermission('reports', 'read')],
  }, async (request) => {
    const { tenantId } = request.user as { tenantId: string };
    const { data } = await supabase
      .from('incidents').select('*')
      .eq('tenant_id', tenantId)
      .order('detected_at', { ascending: false })
      .limit(50);
    return { incidents: data ?? [] };
  });

  app.post('/api/v2/rede/incidents/scan', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'write')],
  }, async (request, reply) => {
    if (!isNocAutonomoEnabled()) {
      return reply.code(409).send({ error: 'NOC autônomo desabilitado (NOC_AUTONOMO_ENABLED=true para ligar).' });
    }
    const { tenantId } = request.user as { tenantId: string };
    try {
      return await scanForIncidents(tenantId);
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  const transition = (to: 'confirmada' | 'normalizada' | 'cancelada') =>
    async (request: any, reply: any) => {
      const { tenantId } = request.user as { tenantId: string };
      const { id } = request.params as { id: string };
      try {
        await transitionIncident(tenantId, id, to);
        return { success: true, status: to };
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    };

  app.patch('/api/v2/rede/incidents/:id/confirm', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'write')],
  }, transition('confirmada'));

  app.patch('/api/v2/rede/incidents/:id/normalize', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'write')],
  }, transition('normalizada'));

  app.patch('/api/v2/rede/incidents/:id/cancel', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'write')],
  }, transition('cancelada'));

  // Comunicar tem gate humano por padrão (RN14) — é um PATCH explícito do operador.
  app.patch('/api/v2/rede/incidents/:id/communicate', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'write')],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const { message } = (request.body ?? {}) as { message?: string };
    try {
      const r = await communicateIncident(tenantId, id, message);
      return { success: true, notified: r.customerCount };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });
}
