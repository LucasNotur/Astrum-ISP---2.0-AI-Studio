/**
 * D-22 — Rotas da Rede de Alerta Precoce.
 * POST /api/v2/threats/broadcast  — broadcast sinal (owner/admin)
 * GET  /api/v2/threats            — listar sinais recentes
 * GET  /api/v2/threats/:id/immunized — checar se tenant está imunizado
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { broadcastThreatSignal, listThreatSignals, isImmunized, defaultPorts, isThreatNetworkEnabled } from './threat-network.service';

export async function threatNetworkRoutes(app: FastifyInstance) {
  const prefix = '/api/v2/threats';

  app.post(`${prefix}/broadcast`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    if (!isThreatNetworkEnabled()) {
      return reply.code(503).send({ error: 'THREAT_NETWORK_ENABLED=false. Desbloqueio: ≥10 tenants + aprovação LGPD.' });
    }
    const user = (req as any).user;
    if (!['owner', 'admin', 'super_admin'].includes(user?.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
    const { signalType, description, evidence = {}, severity = 'medium' } = req.body as any;
    if (!signalType || !description) {
      return reply.code(400).send({ error: 'signalType e description são obrigatórios.' });
    }
    const result = await broadcastThreatSignal(getTenantId(user) ?? '', { signalType, description, evidence, severity }, defaultPorts);
    return reply.code(201).send(result);
  });

  app.get(prefix, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const { type, severity, limit } = req.query as any;
    const signals = await listThreatSignals({
      signalType: type,
      severity,
      limit: limit ? parseInt(limit) : 50,
    }, defaultPorts);
    return reply.send({ signals, count: signals.length });
  });

  app.get(`${prefix}/:id/immunized`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const immunized = await isImmunized(getTenantId(user) ?? '', id, defaultPorts);
    return reply.send({ immunized, signalId: id, tenantId: getTenantId(user) ?? '' });
  });
}
