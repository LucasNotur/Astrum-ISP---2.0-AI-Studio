import { test, expect } from '@playwright/test';
import { loginAs, loginViaAPI, TEST_CREDENTIALS } from './helpers/auth';

test.describe('Autenticação', () => {
  test('login com credenciais válidas redireciona para dashboard', async ({ page }) => {
    await loginAs(page, 'admin');

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('.dashboard-page')).toBeVisible();
    await expect(page.locator('.dashboard-title')).toContainText('Dashboard');
  });

  test('login com credenciais inválidas mostra erro', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('naoexiste@email.com');
    await page.getByLabel('Senha').fill('senhaerrada123');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(page.locator('[role="alert"]')).toContainText(/incorretos|inválid/i);
    await expect(page).toHaveURL(/\/login/); // não redirecionou
  });

  test('rota protegida sem login redireciona para /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('viewer não acessa rota de admin (/knowledge)', async ({ page }) => {
    // Login via API para testar autorização
    await loginViaAPI(page, 'operator');
    await page.goto('/knowledge');
    // Deve redirecionar para dashboard (sem permissão)
    await expect(page).not.toHaveURL(/\/knowledge/);
  });

  test('login rápido via API funciona para testes', async ({ page }) => {
    await loginViaAPI(page, 'admin');
    await expect(page.locator('.dashboard-page')).toBeVisible();
  });

  test('página de login tem elementos de acessibilidade', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Senha')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });
});
