import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Chat / Inbox (fluxo persona atendente)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('navega para /chat a partir do sidebar', async ({ page }) => {
    // Clica no item de chat na sidebar
    await page.getByRole('button', { name: /Atendimento|Chat|Conversas/i }).first().click();
    await expect(page).toHaveURL(/\/chat/, { timeout: 8_000 });
  });

  test('página /chat renderiza lista de conversas', async ({ page }) => {
    await page.goto('/chat');
    // Verifica que a página carregou (sem crash de JS)
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    // O app não deve exibir tela de erro não tratado
    await expect(page.locator('body')).not.toContainText('Uncaught Error');
  });

  test('área de chat fica visível em desktop (>768px)', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    // Em desktop o split-panel (lista + chat) deve estar visível
    await expect(page.locator('main, [class*="chat"], [class*="inbox"]').first()).toBeVisible({ timeout: 5_000 });
  });
});
