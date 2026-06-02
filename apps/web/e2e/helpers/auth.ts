import type { Page } from '@playwright/test';

/**
 * Helpers de autenticação para os testes E2E.
 * Usa credenciais de teste criadas no banco de dados seed.
 */

export const TEST_CREDENTIALS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@isp-teste.astrum.dev',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'TestAdmin@2024',
  },
  operator: {
    email: process.env.E2E_OPERATOR_EMAIL ?? 'operator@isp-teste.astrum.dev',
    password: process.env.E2E_OPERATOR_PASSWORD ?? 'TestOp@2024',
  },
};

/**
 * Realiza login pela UI e aguarda redirecionamento para o dashboard.
 */
export async function loginAs(page: Page, role: 'admin' | 'operator' = 'admin') {
  const creds = TEST_CREDENTIALS[role];

  await page.goto('/login');
  await page.waitForURL('**/login');

  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Senha').fill(creds.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Aguardar redirecionamento para dashboard
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

/**
 * Login via API (mais rápido — sem UI, para testes que não testam auth).
 */
export async function loginViaAPI(page: Page, role: 'admin' | 'operator' = 'admin') {
  const creds = TEST_CREDENTIALS[role];
  const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:3001';

  const response = await page.request.post(`${apiUrl}/api/v2/auth/login`, {
    data: { email: creds.email, password: creds.password },
  });

  const data = await response.json();

  // Salvar token no localStorage para ser usado pelo frontend
  await page.evaluate(({ accessToken, refreshToken }) => {
    localStorage.setItem('astrum_auth', JSON.stringify({ accessToken, refreshToken }));
  }, { accessToken: data.accessToken, refreshToken: data.refreshToken });

  await page.goto('/dashboard');
  await page.waitForURL('**/dashboard');
}

/**
 * Verificar que o usuário está autenticado (header ou elemento visível).
 */
export async function expectAuthenticated(page: Page) {
  await page.waitForSelector('.dashboard-page', { timeout: 5000 });
}

/**
 * Logout.
 */
export async function logout(page: Page) {
  localStorage.clear();
  await page.goto('/login');
}
