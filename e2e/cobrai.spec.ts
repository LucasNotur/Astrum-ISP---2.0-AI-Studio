import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('CobrAI (fluxo persona financeiro)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('navega para /cobrai', async ({ page }) => {
    await page.goto('/cobrai');
    await expect(page).toHaveURL(/\/cobrai/);
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
  });

  test('página CobrAI renderiza sem erro de JS', async ({ page }) => {
    await page.goto('/cobrai');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    await expect(page.locator('body')).not.toContainText('Uncaught Error');
  });

  test('exibe algum título ou conteúdo de cobrança', async ({ page }) => {
    await page.goto('/cobrai');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    // Verifica que há pelo menos um heading ou texto identificador da página
    const pageContent = await page.locator('h1, h2, [class*="title"]').first();
    await expect(pageContent).toBeVisible({ timeout: 8_000 });
  });

  test('navega para /billing (2ª via de fatura)', async ({ page }) => {
    await page.goto('/billing');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    await expect(page).toHaveURL(/\/billing/);
    await expect(page.locator('body')).not.toContainText('Uncaught Error');
  });
});
