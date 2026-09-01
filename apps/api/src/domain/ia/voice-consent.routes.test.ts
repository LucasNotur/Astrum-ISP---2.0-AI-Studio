import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../atendimento/voice-verify.service', () => ({
  grantConsent: vi.fn(),
  revokeConsent: vi.fn(),
  hasConsent: vi.fn(),
}));

import { grantConsent, revokeConsent, hasConsent } from '../atendimento/voice-verify.service';
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

  // SEC voice-consent (2026-09-01): GET/DELETE precisam propagar o tenant do JWT ao service,
  // senão viram IDOR cross-tenant (leitura + revogação/exclusão de biometria de outro provedor).
  it('DELETE consent -> revoga escopado ao tenant do JWT', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v2/ia/voice/consent/c1' });
    expect(res.statusCode).toBe(200);
    expect(revokeConsent).toHaveBeenCalledWith('c1', 'tenant-1');
  });

  it('GET consent -> consulta escopada ao tenant do JWT', async () => {
    (hasConsent as any).mockResolvedValueOnce(true);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/voice/consent/c1' });
    expect(res.statusCode).toBe(200);
    expect(hasConsent).toHaveBeenCalledWith('c1', 'tenant-1');
  });

  it('DELETE/GET sem tenant no JWT -> 401 e não toca no service', async () => {
    const app = await buildApp({ userId: 'op-1', role: 'admin' }); // sem tenantId/tenant_id
    const del = await app.inject({ method: 'DELETE', url: '/api/v2/ia/voice/consent/c1' });
    const get = await app.inject({ method: 'GET', url: '/api/v2/ia/voice/consent/c1' });
    expect(del.statusCode).toBe(401);
    expect(get.statusCode).toBe(401);
    expect(revokeConsent).not.toHaveBeenCalled();
    expect(hasConsent).not.toHaveBeenCalled();
  });
});
