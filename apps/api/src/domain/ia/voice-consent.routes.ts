import { FastifyInstance } from 'fastify';
import {
  grantConsent,
  revokeConsent,
  hasConsent,
} from '../atendimento/voice-verify.service';

export async function voiceConsentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    await (app as any).authenticate(req, reply);
  });

  app.post('/api/v2/ia/voice/consent', async (req, reply) => {
    const tenantId = (req as any).user?.tenant_id;
    const { customerId } = req.body as { customerId: string };
    if (!tenantId || !customerId) return reply.code(400).send({ error: 'customerId obrigatório' });

    await grantConsent(customerId, tenantId, 'api');
    return { ok: true };
  });

  app.delete('/api/v2/ia/voice/consent/:customerId', async (req, reply) => {
    const customerId = (req.params as any).customerId;
    if (!customerId) return reply.code(400).send({ error: 'customerId obrigatório' });

    await revokeConsent(customerId);
    return { ok: true };
  });

  app.get('/api/v2/ia/voice/consent/:customerId', async (req) => {
    const customerId = (req.params as any).customerId;
    const consented = await hasConsent(customerId);
    return { consented };
  });
}
