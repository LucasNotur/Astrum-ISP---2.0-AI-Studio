import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers/auth';

test.describe('WebSockets — Tempo Real', () => {
  test('painel do operador conecta via WebSocket', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/dashboard');

    // Verificar que WS foi estabelecido
    const wsConnected = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const ws = new WebSocket(
          `${location.origin.replace('http', 'ws')}/ws/notifications?token=` +
          JSON.parse(localStorage.getItem('astrum_auth') ?? '{}').accessToken
        );
        ws.onopen = () => { ws.close(); resolve(true); };
        ws.onerror = () => resolve(false);
        setTimeout(() => resolve(false), 5000);
      });
    });

    expect(wsConnected).toBe(true);
  });

  test('indicador de conexão aparece na UI', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/dashboard');

    // Aguardar indicador de WS conectado
    await expect(page.locator('[data-ws-status="connected"]')).toBeVisible({ timeout: 5000 });
  });
});
