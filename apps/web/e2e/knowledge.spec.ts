import { test, expect } from '@playwright/test';
import path from 'path';
import { loginViaAPI } from './helpers/auth';

test.describe('Base de Conhecimento (RAG)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/knowledge');
  });

  test('página de knowledge carrega corretamente', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Base de Conhecimento');
    await expect(page.locator('.upload-zone')).toBeVisible();
  });

  test('zona de upload aceita clique para abrir file picker', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('label[for="file-upload"]').click();
    const fileChooser = await fileChooserPromise;
    expect(fileChooser).toBeDefined();
  });

  test('upload de arquivo TXT válido funciona', async ({ page }) => {
    // Criar arquivo de teste temporário
    const fileContent = 'Manual de teste: Para reiniciar o roteador, pressione o botão por 10s.';
    const fileName = 'manual-teste.txt';

    // Interceptar request de upload
    await page.route('**/api/v2/documents/upload', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'doc-test-123',
          filename: fileName,
          status: 'processing',
        }),
      });
    });

    // Mock da lista de documentos
    await page.route('**/api/v2/documents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documents: [{
            id: 'doc-test-123',
            filename: fileName,
            file_type: 'txt',
            status: 'indexed',
            chunks_count: 3,
            created_at: new Date().toISOString(),
          }],
        }),
      });
    });

    // Fazer upload via programmatic file input
    const dataTransfer = await page.evaluateHandle((content) => {
      const dt = new DataTransfer();
      const file = new File([content], 'manual-teste.txt', { type: 'text/plain' });
      dt.items.add(file);
      return dt;
    }, fileContent);

    await page.dispatchEvent('#file-upload', 'change', { dataTransfer });

    // Verificar documento na lista
    await expect(page.locator('.doc-name')).toContainText(fileName);
  });

  test('arquivo com tipo inválido mostra erro', async ({ page }) => {
    // Simular upload de arquivo .exe (não permitido)
    await page.evaluate(() => {
      const input = document.getElementById('file-upload') as HTMLInputElement;
      const file = new File(['conteúdo'], 'virus.exe', { type: 'application/octet-stream' });
      const dt = new DataTransfer();
      dt.items.add(file);
      Object.defineProperty(input, 'files', { value: dt.files });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await expect(page.locator('.form-error')).toBeVisible();
    await expect(page.locator('.form-error')).toContainText(/não permitido/i);
  });

  test('drag-and-drop muda visual da zona', async ({ page }) => {
    const zone = page.locator('.upload-zone');

    await zone.dispatchEvent('dragover', {
      dataTransfer: await page.evaluateHandle(() => new DataTransfer()),
    });

    await expect(zone).toHaveClass(/drag-over/);
  });
});
