import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { complianceRoutes } from './compliance.routes';

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: 'test-secret-32-chars-minimum-xx' });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
  await app.register(complianceRoutes);
  await app.ready();
  return app;
}

describe('GET /api/v2/compliance/dpa', () => {
  it('retorna DPA com versão e seções', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/compliance/dpa' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBeDefined();
    expect(Array.isArray(body.sections)).toBe(true);
    expect(body.sections.length).toBeGreaterThan(4);
    expect(body.contact.dpo).toContain('@');
  });

  it('inclui seção sobre LGPD e direitos dos titulares', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/compliance/dpa' });
    const body = res.json();
    const s5 = body.sections.find((s: any) => s.id === 'S5');
    expect(s5).toBeDefined();
    expect(s5.content).toContain('exclusão');
  });

  it('retorna header Cache-Control público', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/compliance/dpa' });
    expect(res.headers['cache-control']).toContain('public');
  });
});

describe('GET /api/v2/compliance/due-diligence', () => {
  it('retorna lista de perguntas e respostas', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/compliance/due-diligence' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.questions)).toBe(true);
    expect(body.questions.length).toBeGreaterThanOrEqual(6);
  });

  it('cada QA tem campos q e a', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/compliance/due-diligence' });
    const { questions } = res.json();
    for (const qa of questions) {
      expect(qa).toHaveProperty('q');
      expect(qa).toHaveProperty('a');
    }
  });

  it('menciona isolamento de tenant por RLS', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/compliance/due-diligence' });
    const { questions } = res.json();
    const rlsQ = questions.find((q: any) => q.a.toLowerCase().includes('rls'));
    expect(rlsQ).toBeDefined();
  });
});

describe('GET /api/v2/compliance/policy', () => {
  it('401 sem token', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/compliance/policy' });
    expect(res.statusCode).toBe(401);
  });

  it('retorna política com tenantId do token', async () => {
    const app = await buildApp();
    const token = (app as any).jwt.sign({ sub: 'u1', tenantId: 'isp-abc', role: 'admin' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/compliance/policy',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tenantId).toBe('isp-abc');
    expect(body.rlsEnabled).toBe(true);
    expect(body.dataRetention.conversations).toBe('24 months');
  });
});
