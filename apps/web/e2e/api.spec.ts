import { test, expect } from '@playwright/test';

/**
 * Testes de API usando Playwright request context.
 * Testa o backend diretamente — sem UI.
 * Mais rápido que E2E completo para validar contrato de API.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

let accessToken = '';

test.describe('API — Contrato de Endpoints', () => {
  test.beforeAll(async ({ request }) => {
    // Login via API uma vez para todos os testes
    const response = await request.post(`${API_URL}/api/v2/auth/login`, {
      data: {
        email: process.env.E2E_ADMIN_EMAIL ?? 'admin@isp-teste.astrum.dev',
        password: process.env.E2E_ADMIN_PASSWORD ?? 'TestAdmin@2024',
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    accessToken = data.accessToken;
    expect(accessToken).toBeTruthy();
  });

  test('GET /api/v2/health retorna status ok', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v2/health`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.services).toBeDefined();
  });

  test('GET /api/v2/analytics/dashboard retorna estrutura correta', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v2/analytics/dashboard?period=7d`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('period');
    expect(data).toHaveProperty('ticketResolution');
    expect(data).toHaveProperty('inadimplencia');
  });

  test('GET /api/v2/billing/plan retorna limites do plano', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v2/billing/plan`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(['starter', 'pro', 'enterprise']).toContain(data.plan);
    expect(data.limits).toBeDefined();
    expect(data.usage).toBeDefined();
  });

  test('POST /api/v2/rag/query responde sem erro', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/v2/rag/query`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { query: 'Como reiniciar o roteador?', maxContextChunks: 3 },
    });
    // Pode retornar 200 (com ou sem RAG) — nunca 500
    expect(response.status()).toBeLessThan(500);
  });

  test('rota protegida sem token retorna 401', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v2/tickets`);
    expect(response.status()).toBe(401);
  });

  test('X-Cache header presente nas rotas analíticas', async ({ request }) => {
    // Primeira request (MISS)
    await request.get(`${API_URL}/api/v2/analytics/dashboard?period=30d`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Segunda request (HIT)
    const response = await request.get(`${API_URL}/api/v2/analytics/dashboard?period=30d`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const cacheHeader = response.headers()['x-cache'];
    expect(['HIT', 'MISS']).toContain(cacheHeader);
  });

  test('POST /api/v2/onboarding/check-slug/:slug verifica disponibilidade', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v2/onboarding/check-slug/isp-disponivel-teste`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('available');
  });
});
