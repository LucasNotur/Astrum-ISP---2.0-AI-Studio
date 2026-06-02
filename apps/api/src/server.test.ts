import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from './server';
import type { FastifyInstance } from 'fastify';

describe('Servidor Fastify v2', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-32-chars-minimum-length';
    process.env.SUPABASE_URL = 'https://placeholder.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'placeholder';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'placeholder';
    process.env.OPENAI_API_KEY = 'sk-placeholder';
    
    app = await buildServer();
    await app.ready();
  });

  afterAll(() => app.close());

  it('GET /api/v2/health retorna 200 com status dos serviços', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v2/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.services).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  it('rota inexistente retorna 404 com código estruturado', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v2/nao-existe' });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('NOT_FOUND');
  });

  it('GET /api/v2/status retorna versão da arquitetura', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v2/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.version).toBe('2.0.0');
    expect(body.architecture).toBe('fastify-ddd-hexagonal');
  });
});
