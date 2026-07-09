import { FastifyInstance } from 'fastify';
import {
  getConstitution,
  saveConstitution,
  isConstitutionalLoopEnabled,
} from '../../infrastructure/guardrails/constitution.service';

export async function constitutionRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    await (app as any).authenticate(req, reply);
  });

  app.get('/api/v2/ia/constitution', async (req) => {
    const tenantId = (req as any).user?.tenant_id;
    if (!tenantId) return { principles: [], enabled: false };
    const principles = await getConstitution(tenantId);
    return { principles, enabled: isConstitutionalLoopEnabled() };
  });

  app.put<{ Body: { principles: string[] } }>(
    '/api/v2/ia/constitution',
    async (req, reply) => {
      const tenantId = (req as any).user?.tenant_id;
      if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });
      const { principles } = req.body;
      if (!Array.isArray(principles)) {
        return reply.code(400).send({ error: 'principles deve ser um array' });
      }
      const userId = (req as any).user?.sub ?? (req as any).user?.id;
      const result = await saveConstitution(tenantId, principles, userId);
      if (!result.ok) return reply.code(400).send({ error: result.error });
      return { ok: true };
    },
  );
}
