import type { Page } from '@playwright/test';

/**
 * Helpers de autenticação para os testes E2E.
 * Usa Mocks de Rede para evitar a necessidade do Backend real.
 */

export async function mockAuthRoutes(page: Page, role: 'admin' | 'operator' = 'admin') {
  await page.route('**/api/v2/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'fake-access-token',
        refreshToken: 'fake-refresh-token',
        user: { id: 'user-123', role: role, email: 'test@example.com' },
        tenant: { id: 'tenant-123', slug: 'teste' }
      })
    });
  });

  await page.route('**/api/v2/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'user-123', role: role, email: 'test@example.com',
        tenant: { id: 'tenant-123', slug: 'teste', plan_id: 'pro' }
      })
    });
  });
}

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
  await mockAuthRoutes(page, role);
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
  await mockAuthRoutes(page, role);

  await page.goto('/'); // go to a neutral page first to set context if needed, or just evaluate
  
  // Salvar token no localStorage para ser usado pelo frontend
  await page.evaluate(() => {
    localStorage.setItem('astrum_auth', JSON.stringify({ accessToken: 'fake-access-token', refreshToken: 'fake-refresh-token' }));
  });

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
