// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { themeManager } from '../../lib/themeManager';
import { getDoc, doc } from 'firebase/firestore';

vi.mock('firebase/firestore', () => ({
  getDoc: vi.fn(),
  doc: vi.fn(),
  getFirestore: vi.fn()
}));

vi.mock('../../lib/firebase', () => ({
  db: {}
}));

describe('themeManager', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    document.documentElement.style.cssText = '';
    
    // Clear theme cache
    themeManager.clearCache();
  });

  it('1. themeManager.load(tenantId) → aplica CSS variable --primary-color com o valor do Firestore', async () => {
    (getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ theme: { primary_color: '#FF0000' } })
    });

    await themeManager.load('t1');
    expect(document.documentElement.style.getPropertyValue('--primary-color')).toBe('#FF0000');
  });

  it('2. Tenant sem primary_color configurado → aplica cor padrão #00C896 sem lançar erro', async () => {
    (getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ theme: { secondary_color: '#000000' } }) // sem primary
    });

    await themeManager.load('no-primary');
    expect(document.documentElement.style.getPropertyValue('--primary-color')).toBe('#00C896');
  });

  it('3. Tenant A e B com cores diferentes → CSS variables corretas para cada um (não compartilham)', async () => {
    (getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ theme: { primary_color: '#AAAAAA' } })
    });
    await themeManager.load('A');
    expect(document.documentElement.style.getPropertyValue('--primary-color')).toBe('#AAAAAA');

    (getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ theme: { primary_color: '#BBBBBB' } })
    });
    await themeManager.load('B');
    expect(document.documentElement.style.getPropertyValue('--primary-color')).toBe('#BBBBBB');
  });

  it('4. logo_url válida → exibida no header (não a logo padrão da Astrum)', async () => {
    (getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ theme: { logo_url: '/custom-logo.png' } })
    });

    await themeManager.load('t1');
    expect(document.documentElement.style.getPropertyValue('--logo-url')).toBe('url(/custom-logo.png)');
  });

  it('5. login_background_url ausente → usa background padrão sem quebrar tela de login', async () => {
    (getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ theme: { primary_color: '#123123' } }) // ausente login_background_url
    });

    await themeManager.load('missing-bg');
    expect(document.documentElement.style.getPropertyValue('--login-background-url')).toBe('url()'); // DEFAULT is empty string
  });

  it('6. Cache Redis → segunda carga do mesmo tenant não busca no Firestore', async () => {
    (getDoc as any).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ theme: { primary_color: '#CACHE' } })
    });

    // Primeira vez: busca do Firestore e salva no Redis
    await themeManager.load('t1');
    expect(getDoc).toHaveBeenCalledTimes(1);

    // Segunda vez: pega do Redis
    await themeManager.load('t1');
    expect(getDoc).toHaveBeenCalledTimes(1); // Continua 1
    
    expect(document.documentElement.style.getPropertyValue('--primary-color')).toBe('#CACHE');
  });
});
