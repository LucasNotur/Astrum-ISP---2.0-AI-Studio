import { test, expect } from '@playwright/test';
import { mockSupabase, loginAs } from './helpers/auth';

test.describe('Autenticação', () => {
  test('login com credenciais válidas redireciona para /dashboard', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('login com credenciais inválidas mostra toast de erro', async ({ page }) => {
    // Supabase retorna 400 para credenciais inválidas
    await page.route('**/auth/v1/token**', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      });
    });

    await page.goto('/');
    await page.getByPlaceholder('Seu e-mail de trabalho').fill('invalido@teste.com');
    await page.getByPlaceholder('Sua senha').fill('senhaerrada');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText(/Erro ao fazer login|Invalid login credentials/i)).toBeVisible({ timeout: 5_000 });
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test('campos vazios exibem aviso sem chamar Supabase', async ({ page }) => {
    let authCalled = false;
    await page.route('**/auth/v1/token**', async (route) => {
      authCalled = true;
      await route.continue();
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText(/Informe e-mail e senha/i)).toBeVisible({ timeout: 5_000 });
    expect(authCalled).toBe(false);
  });

  test('página de login tem campos acessíveis', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('Seu e-mail de trabalho')).toBeVisible();
    await expect(page.getByPlaceholder('Sua senha')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  test('rota protegida sem sessão redireciona para login', async ({ page }) => {
    await mockSupabase(page);
    // Sem fazer login, navega diretamente para rota protegida
    await page.goto('/customers');
    // App sem sessão deve renderizar tela de login
    await expect(page.getByPlaceholder('Seu e-mail de trabalho')).toBeVisible({ timeout: 8_000 });
  });
});
