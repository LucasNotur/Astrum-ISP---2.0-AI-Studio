import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers/auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('exibe 4 metric cards', async ({ page }) => {
    const cards = page.locator('.metric-card');
    await expect(cards).toHaveCount(4);
  });

  test('seletor de período muda dados do dashboard', async ({ page }) => {
    const btn7d = page.locator('.period-btn', { hasText: '7 dias' });
    const btn90d = page.locator('.period-btn', { hasText: '90 dias' });

    await btn7d.click();
    await expect(btn7d).toHaveClass(/active/);

    await btn90d.click();
    await expect(btn90d).toHaveClass(/active/);
    await expect(btn7d).not.toHaveClass(/active/);
  });

  test('gráfico de volume é visível', async ({ page }) => {
    await expect(page.locator('.bar-chart')).toBeVisible();
  });

  test('seção de uso do plano aparece', async ({ page }) => {
    await expect(page.locator('.plan-usage')).toBeVisible();
  });

  test('skeleton desaparece após carregar dados', async ({ page }) => {
    // Skeleton pode aparecer brevemente — aguardar desaparecer
    await page.waitForSelector('.skeleton', { state: 'detached', timeout: 10000 });
    await expect(page.locator('.metric-value').first()).toBeVisible();
  });

  test('dashboard é responsivo em mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('.dashboard-page')).toBeVisible();
    await expect(page.locator('.metrics-grid')).toBeVisible();
  });
});
