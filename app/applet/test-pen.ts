import { buildServer } from './apps/api/src/server.ts';
import jwt from 'jsonwebtoken';

async function run() {
  const app = await buildServer();
  await app.ready();

  let passed = 0;

  // Test 1: SQL Injection
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/v2/auth/login',
    payload: { email: "' OR '1'='1", password: "qualquer" }
  });
  console.log(`Test 1: SQL Injection -> Esperado 400, Obtido ${res1.statusCode}`);
  if (res1.statusCode === 400) passed++;

  // Test 2: JWT expirado
  const expiredToken = jwt.sign({ userId: '123' }, process.env.JWT_SECRET || 'dev-secret-change-in-production', { expiresIn: '-1s' });
  const res2 = await app.inject({
    method: 'GET',
    url: '/api/v2/tickets',
    headers: { Authorization: `Bearer ${expiredToken}` }
  });
  console.log(`Test 2: JWT expirado -> Esperado 401, Obtido ${res2.statusCode}`);
  if (res2.statusCode === 401) passed++;

  // Test 3: Role insuficiente
  const viewerToken = app.jwt.sign({ userId: '123', tenantId: '123', role: 'viewer' });
  const res3 = await app.inject({
    method: 'DELETE',
    url: '/api/v2/tickets/qualquer-id',
    headers: { Authorization: `Bearer ${viewerToken}` }
  });
  console.log(`Test 3: Role insuficiente -> Esperado 403, Obtido ${res3.statusCode}`);
  if (res3.statusCode === 403) passed++;

  // Test 4: Webhook sem HMAC
  const res4 = await app.inject({
    method: 'POST',
    url: '/api/webhook/evolution',
    payload: {}
  });
  console.log(`Test 4: Webhook sem HMAC -> Esperado 401, Obtido ${res4.statusCode}`);
  if (res4.statusCode === 401) passed++;

  // Test 5: Refresh token inválido
  const res5 = await app.inject({
    method: 'POST',
    url: '/api/v2/auth/refresh',
    payload: { refreshToken: "token-inventado-aqui" }
  });
  console.log(`Test 5: Refresh token inválido -> Esperado 401, Obtido ${res5.statusCode}`);
  if (res5.statusCode === 401) passed++;

  // Extra: check security headers
  const res6 = await app.inject({
    method: 'GET',
    url: '/api/v2/health'
  });
  console.log("Headers:");
  console.log('x-content-type-options:', res6.headers['x-content-type-options']);
  console.log('x-frame-options:', res6.headers['x-frame-options']);
  console.log('x-xss-protection:', res6.headers['x-xss-protection']);
  console.log('content-security-policy:', !!res6.headers['content-security-policy']);

  console.log(`\nPASSED: ${passed}/5`);

  await app.close();
}

run().catch(console.error);
