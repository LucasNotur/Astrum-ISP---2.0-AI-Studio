/**
 * D-19 — Rotas do Gêmeo do Assinante.
 * POST /api/v2/intelligence/twin/customer/:id/simulate — simular ação por cliente
 * POST /api/v2/intelligence/twin/segment/simulate     — simular por segmento
 * GET  /api/v2/intelligence/twin/simulations          — histórico de simulações
 */
import type { FastifyInstance } from 'fastify';
import { simulateAction, simulateSegment, defaultPorts, type ActionType } from './subscriber-twin.service';

export async function subscriberTwinRoutes(app: FastifyInstance) {
  const prefix = '/api/v2/intelligence/twin';

  app.post(`${prefix}/customer/:customerId/simulate`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { customerId } = req.params as any;
    const { actionType, actionParams = {} } = req.body as any;

    const VALID_ACTIONS: ActionType[] = ['price_change', 'suspension', 'offer', 'upgrade', 'downgrade'];
    if (!VALID_ACTIONS.includes(actionType)) {
      return reply.code(400).send({ error: `actionType inválido. Valores: ${VALID_ACTIONS.join(', ')}` });
    }

    const result = await simulateAction(user.tenantId, customerId, actionType, actionParams, defaultPorts);
    return reply.send(result);
  });

  app.post(`${prefix}/segment/simulate`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { actionType, actionParams = {}, segmentFilter = {} } = req.body as any;

    const VALID_ACTIONS: ActionType[] = ['price_change', 'suspension', 'offer', 'upgrade', 'downgrade'];
    if (!VALID_ACTIONS.includes(actionType)) {
      return reply.code(400).send({ error: `actionType inválido.` });
    }

    const result = await simulateSegment(user.tenantId, segmentFilter, actionType, actionParams, defaultPorts);
    return reply.send(result);
  });

  app.get(`${prefix}/simulations`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { data, error } = await defaultPorts.db
      .from('subscriber_simulations')
      .select('id,action_type,action_params,result,created_at')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ simulations: data });
  });
}
