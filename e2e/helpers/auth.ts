import type { Page } from '@playwright/test';

const FAKE_USER = {
  id: 'test-user-123',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@isp-teste.astrum.dev',
  email_confirmed_at: '2024-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  user_metadata: {},
  app_metadata: { provider: 'email', providers: ['email'] },
  identities: [],
};

const FAKE_SESSION = {
  access_token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJhZG1pbkBpc3AtdGVzdGUuYXN0cnVtLmRldiIsInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImV4cCI6OTk5OTk5OTk5OX0.fake-signature',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 9999999999,
  refresh_token: 'fake-refresh-token-xyz',
  user: FAKE_USER,
};

export type TestRole = 'admin' | 'operator';

export const TEST_CREDENTIALS: Record<TestRole, { email: string; password: string }> = {
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
 * Intercepta todas as chamadas Supabase e retorna respostas fake.
 * Registra catch-all primeiro (baixa prioridade) e específicos depois.
 */
export async function mockSupabase(page: Page, role: TestRole = 'admin') {
  const dbUser = {
    id: FAKE_USER.id,
    email: FAKE_USER.email,
    role,
    tenant_id: 'tenant-123',
  };

  // Catch-all para REST (menor prioridade — registrado primeiro)
  await page.route('**/rest/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // Tabela users — role check (maior prioridade — registrado depois)
  await page.route('**/rest/v1/users**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([dbUser]),
    });
  });

  // Tabela tenant_settings
  await page.route('**/rest/v1/tenant_settings**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ theme: {}, enabled_modules: null }]),
    });
  });

  // Auth: refresh / session token
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FAKE_SESSION),
    });
  });

  // Auth: get user
  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FAKE_USER),
    });
  });
}

/**
 * Faz login pela UI e aguarda a navegação para /dashboard.
 */
export async function loginAs(page: Page, role: TestRole = 'admin') {
  await mockSupabase(page, role);

  await page.goto('/');
  await page.getByPlaceholder('Seu e-mail de trabalho').fill(TEST_CREDENTIALS[role].email);
  await page.getByPlaceholder('Sua senha').fill(TEST_CREDENTIALS[role].password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

/**
 * Login mais rápido via injeção de sessão no localStorage (evita o fluxo de UI).
 * Útil para testes que não precisam testar o auth em si.
 */
export async function loginViaStorage(page: Page, role: TestRole = 'admin') {
  await mockSupabase(page, role);

  // Navega para uma rota neutra para que o localStorage seja acessível
  await page.goto('/');

  // Injeta sessão fake no localStorage no formato esperado pelo Supabase JS
  await page.evaluate((session) => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    const key = keys[0] ?? 'sb-fake-auth-token';
    localStorage.setItem(key, JSON.stringify(session));
  }, { currentSession: FAKE_SESSION, expiresAt: FAKE_SESSION.expires_at });

  await page.goto('/dashboard');
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}
