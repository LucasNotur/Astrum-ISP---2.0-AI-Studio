import { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
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
    const tenantId = getTenantId((req as any).user);
    const { customerId } = req.body as { customerId: string };
    if (!tenantId || !customerId) return reply.code(400).send({ error: 'customerId obrigatório' });

    await grantConsent(customerId, tenantId, 'api');
    return { ok: true };
  });

  app.delete('/api/v2/ia/voice/consent/:customerId', async (req, reply) => {
    const tenantId = getTenantId((req as any).user);
    const customerId = (req.params as any).customerId;
    if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });
    if (!customerId) return reply.code(400).send({ error: 'customerId obrigatório' });

    // Isolamento: o consentimento/biometria só é revogado dentro do tenant do JWT.
    await revokeConsent(customerId, tenantId);
    return { ok: true };
  });

  app.get('/api/v2/ia/voice/consent/:customerId', async (req, reply) => {
    const tenantId = getTenantId((req as any).user);
    const customerId = (req.params as any).customerId;
    if (!tenantId) return reply.code(401).send({ error: 'Sem tenant' });

    const consented = await hasConsent(customerId, tenantId);
    return { consented };
  });
}
