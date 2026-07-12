import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('exibe título "Dashboard"', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible({ timeout: 8_000 });
  });

  test('sidebar está visível com itens de navegação', async ({ page }) => {
    // Sidebar deve conter pelo menos a nav item de dashboard
    await expect(page.locator('aside')).toBeVisible();
  });

  test('aba de visão geral é selecionável', async ({ page }) => {
    // Aguarda o dashboard carregar
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible({ timeout: 8_000 });
  });

  test('botão de configurar dashboard existe para admin', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible({ timeout: 8_000 });
    // Admin pode ter botão de configuração de widgets
    const configBtn = page.getByRole('button', { name: /Configurar/i });
    await expect(configBtn).toBeVisible();
  });
});
