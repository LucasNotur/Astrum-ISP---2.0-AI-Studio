import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../atendimento/voice-verify.service', () => ({
  grantConsent: vi.fn(),
  revokeConsent: vi.fn(),
  hasConsent: vi.fn(),
}));

import { grantConsent } from '../atendimento/voice-verify.service';
import { voiceConsentRoutes } from './voice-consent.routes';

async function buildApp(user: Record<string, any> = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(voiceConsentRoutes);
  await app.ready();
  return app;
}

describe('voice-consent.routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST consent com tenantId -> concede consentimento no tenant certo', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v2/ia/voice/consent', payload: { customerId: 'c1' } });
    expect(res.statusCode).toBe(200);
    expect(grantConsent).toHaveBeenCalledWith('c1', 'tenant-1', 'api');
  });

  it('POST consent com JWT tenant_id (fallback snake_case do helper) -> concede no tenant resolvido', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'POST', url: '/api/v2/ia/voice/consent', payload: { customerId: 'c1' } });
    expect(res.statusCode).toBe(200);
    expect(grantConsent).toHaveBeenCalledWith('c1', 'tenant-1', 'api');
  });
});
