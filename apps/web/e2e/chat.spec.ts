import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers/auth';

test.describe('Chat Streaming', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v2/chat/stream', async (route) => {
      // Delay to allow .typing-cursor to appear in tests
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: "Mock response"\n\n'
      });
    });

    await loginViaAPI(page);
    await page.goto('/chat');
  });

  test('tela de chat exibe sugestões quando vazia', async ({ page }) => {
    await expect(page.locator('.chat-empty')).toBeVisible();
    const chips = page.locator('.suggestion-chip');
    await expect(chips).toHaveCount(3);
  });

  test('campo de mensagem está visível e funcional', async ({ page }) => {
    const input = page.locator('#chat-input');
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();

    await input.fill('Teste de digitação');
    await expect(input).toHaveValue('Teste de digitação');
  });

  test('sugestão rápida popula e envia mensagem', async ({ page }) => {
    const chip = page.locator('.suggestion-chip').first();
    const chipText = await chip.textContent();
    await chip.click();

    // Mensagem do usuário deve aparecer no chat
    await expect(page.locator('.chat-message.user')).toBeVisible();
    await expect(page.locator('.chat-message.user')).toContainText(chipText!.trim());
  });

  test('mensagem enviada aparece no histórico', async ({ page }) => {
    const input = page.locator('#chat-input');
    await input.fill('Como reiniciar o roteador?');
    await page.keyboard.press('Enter');

    // Mensagem do usuário aparece imediatamente
    await expect(page.locator('.chat-message.user').last()).toContainText('Como reiniciar o roteador?');
  });

  test('assistente começa a responder (cursor de streaming aparece)', async ({ page }) => {
    const input = page.locator('#chat-input');
    await input.fill('Olá');
    await page.keyboard.press('Enter');

    // Cursor de streaming deve aparecer brevemente
    await expect(page.locator('.typing-cursor')).toBeVisible({ timeout: 5000 });
  });

  test('botão de parar aparece durante streaming', async ({ page }) => {
    const input = page.locator('#chat-input');
    await input.fill('Explique tudo sobre ISP em detalhes muito extensos');
    await page.keyboard.press('Enter');

    // Botão de parar deve aparecer
    await expect(page.locator('.btn-stop')).toBeVisible({ timeout: 5000 });
    await page.locator('.btn-stop').click();

    // Streaming para e botão some
    await expect(page.locator('.btn-stop')).not.toBeVisible({ timeout: 3000 });
  });

  test('Enter envia, Shift+Enter cria nova linha', async ({ page }) => {
    const input = page.locator('#chat-input');
    await input.fill('Linha 1');
    await page.keyboard.press('Shift+Enter');
    await input.type('Linha 2');

    // Verificar que não foi enviado ainda
    const userMessages = page.locator('.chat-message.user');
    await expect(userMessages).toHaveCount(0);
  });

  test('campo desabilitado durante streaming', async ({ page }) => {
    const input = page.locator('#chat-input');
    await input.fill('Pergunta');
    await page.keyboard.press('Enter');

    // Campo deve ficar desabilitado durante o streaming
    await expect(input).toBeDisabled({ timeout: 3000 });
  });
});
