/**
 * D-17 — Rotas do Marketplace de Playbooks.
 * GET  /api/v2/playbooks                    — listar playbooks públicos
 * POST /api/v2/playbooks                    — publicar playbook (owner/admin)
 * POST /api/v2/playbooks/:id/install        — instalar com backtesting
 * POST /api/v2/playbooks/:id/activate       — ativar instalação
 */
import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import {
  listPlaybooks,
  publishPlaybook,
  installPlaybook,
  activateInstalledPlaybook,
  defaultPorts,
} from './playbook-market.service';

export async function playbookMarketRoutes(app: FastifyInstance) {
  const prefix = '/api/v2/playbooks';

  app.get(prefix, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const { category } = req.query as any;
    const list = await listPlaybooks(category, defaultPorts);
    return reply.send({ playbooks: list });
  });

  app.post(prefix, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    if (!['owner', 'admin', 'super_admin'].includes(user?.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
    const body = req.body as any;
    if (!body.name || !body.policy) {
      return reply.code(400).send({ error: 'name e policy são obrigatórios.' });
    }
    const result = await publishPlaybook(getTenantId(user) ?? '', body, defaultPorts);
    return reply.code(201).send(result);
  });

  app.post(`${prefix}/:id/install`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    const { id } = req.params as any;
    const { skipBacktest = false, activateAfterInstall = false } = (req.body as any) ?? {};
    const result = await installPlaybook(getTenantId(user) ?? '', id, { skipBacktest, activateAfterInstall }, defaultPorts);
    return reply.code(201).send(result);
  });

  app.post(`${prefix}/:id/activate`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    if (!['owner', 'admin', 'super_admin'].includes(user?.role)) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
    const { id } = req.params as any;
    await activateInstalledPlaybook(getTenantId(user) ?? '', id, defaultPorts);
    return reply.send({ ok: true });
  });
}
