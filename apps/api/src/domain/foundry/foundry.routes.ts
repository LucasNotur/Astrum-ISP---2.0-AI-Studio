/**
 * D-16 — Rotas do Foundry.
 * POST   /api/v2/foundry/automate       — criar automação por NL
 * GET    /api/v2/foundry/automations    — listar automações do tenant
 * PATCH  /api/v2/foundry/automations/:id/activate — ativar
 * PATCH  /api/v2/foundry/automations/:id/pause    — pausar
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId, getUserId } from '../../lib/jwt-claims';
import { createAutomation, activateAutomation, listAutomations, defaultPorts } from './foundry.service';

export async function foundryRoutes(app: FastifyInstance) {
  const prefix = '/api/v2/foundry';

  app.post(`${prefix}/automate`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    if (!['admin', 'owner', 'super_admin'].includes(user?.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
    const { prompt } = req.body as any;
    if (!prompt || typeof prompt !== 'string') {
      return reply.code(400).send({ error: 'prompt é obrigatório.' });
    }
    const result = await createAutomation(getTenantId(user) ?? '', prompt, getUserId(user) ?? '', defaultPorts);
    const status = result.validationPassed ? 201 : 422;
    return reply.code(status).send(result);
  });

  app.get(`${prefix}/automations`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const list = await listAutomations(getTenantId(user) ?? '', defaultPorts);
    return reply.send({ automations: list });
  });

  app.patch(`${prefix}/automations/:id/activate`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    if (!['admin', 'owner', 'super_admin'].includes(user?.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
    const { id } = req.params as any;
    await activateAutomation(getTenantId(user) ?? '', id, defaultPorts);
    return reply.send({ ok: true });
  });

  app.patch(`${prefix}/automations/:id/pause`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    await defaultPorts.db.from('automations')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', id).eq('tenant_id', getTenantId(user) ?? '');
    return reply.send({ ok: true });
  });
}
