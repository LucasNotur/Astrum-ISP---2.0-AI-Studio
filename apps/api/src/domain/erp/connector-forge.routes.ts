/**
 * D-13 — Rotas do Connector Forge (super_admin only).
 * POST /api/v2/erp/forge         — gerar connector draft
 * GET  /api/v2/erp/forge         — listar drafts
 * GET  /api/v2/erp/forge/:id     — ver draft específico
 */
import type { FastifyInstance } from 'fastify';
import { generateConnectorDraft, defaultPorts } from './connector-forge.service';

export async function connectorForgeRoutes(app: FastifyInstance) {
  const prefix = '/api/v2/erp/forge';

  app.post(prefix, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    if (user?.role !== 'super_admin') {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
    const { erpName, apiSpec } = req.body as any;
    if (!erpName || typeof apiSpec !== 'object') {
      return reply.code(400).send({ error: 'erpName e apiSpec são obrigatórios.' });
    }
    const result = await generateConnectorDraft(erpName, apiSpec, user.userId, defaultPorts);
    return reply.code(202).send(result);
  });

  app.get(prefix, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    if (user?.role !== 'super_admin') return reply.code(403).send({ error: 'FORBIDDEN' });
    const { data, error } = await defaultPorts.db
      .from('connector_drafts')
      .select('id,erp_name,status,created_at,test_results')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return reply.code(500).send({ error: error.message });
    return reply.send({ drafts: data });
  });

  app.get(`${prefix}/:id`, {
    preHandler: [(app as any).authenticate],
  }, async (req, reply) => {
    const user = (req as any).user;
    if (user?.role !== 'super_admin') return reply.code(403).send({ error: 'FORBIDDEN' });
    const { id } = req.params as any;
    const { data, error } = await defaultPorts.db
      .from('connector_drafts').select('*').eq('id', id).maybeSingle();
    if (error) return reply.code(500).send({ error: error.message });
    if (!data) return reply.code(404).send({ error: 'Draft não encontrado.' });
    return reply.send(data);
  });
}
