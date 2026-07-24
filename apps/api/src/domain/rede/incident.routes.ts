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
  normalizeIncident,
} from './incident-orchestrator.service';
import {
  correlateIncomingTicket,
  type ActiveIncident,
  type CorrelationPorts,
} from './incident-correlation.service';

/** Ports Supabase para a correlação de tickets a incidentes. */
function makeCorrelationPorts(): CorrelationPorts {
  return {
    async getCustomerCto(tenantId, customerId) {
      const { data } = await supabase
        .from('customers').select('cto_id')
        .eq('tenant_id', tenantId).eq('id', customerId).maybeSingle();
      return (data as any)?.cto_id ?? null;
    },
    async listActiveIncidents(tenantId): Promise<ActiveIncident[]> {
      const { data } = await supabase
        .from('incidents').select('id, cto_id, status')
        .eq('tenant_id', tenantId).in('status', ['confirmada', 'comunicada']);
      return (data ?? []).map((i: any) => ({ id: i.id, ctoId: i.cto_id, status: i.status }));
    },
    async suppressTicket(tenantId, ticketId, incidentId, note) {
      const { data: tk } = await supabase
        .from('tickets').select('extra').eq('tenant_id', tenantId).eq('id', ticketId).maybeSingle();
      const extra = { ...((tk as any)?.extra ?? {}), suppressed: true, incident_id: incidentId, suppression_note: note };
      await supabase.from('tickets')
        .update({ ai_enabled: false, extra, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId).eq('id', ticketId);
    },
  };
}

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

  // Normalizar envia a CONFIRMAÇÃO aos afetados (se já haviam sido comunicados).
  app.patch('/api/v2/rede/incidents/:id/normalize', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'write')],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const { message } = (request.body ?? {}) as { message?: string };
    try {
      const r = await normalizeIncident(tenantId, id, message);
      return { success: true, status: 'normalizada', notified: r.notified };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

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

  /**
   * POST /api/v2/rede/tickets/:id/correlate — supressão de tickets (D-04 Fase 2).
   * Se a CTO do cliente do ticket tem incidente ativo, vincula e suprime o ticket.
   */
  app.post('/api/v2/rede/tickets/:id/correlate', {
    preHandler: [app.authenticate, requirePermission('tickets', 'write')],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const { id } = request.params as { id: string };
    const { data: ticket } = await supabase
      .from('tickets').select('id, customer_id').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
    if (!ticket) return reply.code(404).send({ error: 'Ticket não encontrado.' });

    const r = await correlateIncomingTicket(
      tenantId, { id: ticket.id, customerId: (ticket as any).customer_id ?? null }, makeCorrelationPorts(),
    );
    return { success: true, ...r };
  });
}
