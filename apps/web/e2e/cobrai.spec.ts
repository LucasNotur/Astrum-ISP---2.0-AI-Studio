import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers/auth';

test.describe('CobrAI Admin', () => {
  test.beforeEach(async ({ page }) => {
    // Mock das regras para testes determinísticos
    await page.route('**/api/v2/cobrai/rules', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rules: [
            { id: 'rule-1', name: 'Lembrete D+1', days_overdue: 1,
              action: 'send_message', message_template: 'Olá {{customerName}}!', active: true },
            { id: 'rule-2', name: 'Suspensão D+10', days_overdue: 10,
              action: 'suspend_signal', active: true },
          ],
        }),
      });
    });

    await loginViaAPI(page);
    await page.goto('/cobrai');
  });

  test('exibe lista de regras CobrAI', async ({ page }) => {
    await expect(page.locator('.cobrai-card')).toHaveCount(2);
  });

  test('regras ordenadas por dias_overdue', async ({ page }) => {
    const badges = page.locator('.cobrai-day-badge');
    const texts = await badges.allTextContents();
    expect(texts[0]).toContain('D+1');
    expect(texts[1]).toContain('D+10');
  });

  test('toggle ativa/desativa regra', async ({ page }) => {
    await page.route('**/api/v2/cobrai/rules/rule-1', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 200, body: '{}' });
      }
    });

    const toggle = page.locator('.toggle input').first();
    const wasChecked = await toggle.isChecked();

    await toggle.click();

    // Verificar que a request foi feita
    await expect(toggle).not.toBeChecked({ timeout: 2000 });
  });

  test('botão de editar aparece em regras com template', async ({ page }) => {
    // Regra 1 tem template → deve ter botão de editar
    await expect(page.locator('.btn-icon').first()).toBeVisible();
  });

  test('clicar em editar abre editor de template', async ({ page }) => {
    await page.locator('.btn-icon').first().click();
    await expect(page.locator('.template-editor')).toBeVisible();
    await expect(page.locator('.template-textarea')).toBeVisible();
  });

  test('chips de variáveis adicionam texto ao template', async ({ page }) => {
    await page.locator('.btn-icon').first().click();

    const textarea = page.locator('.template-textarea');
    await textarea.clear();

    // Clicar no chip de variável
    await page.locator('.var-chip', { hasText: '{{customerName}}' }).click();
    await expect(textarea).toHaveValue('{{customerName}}');
  });
});
