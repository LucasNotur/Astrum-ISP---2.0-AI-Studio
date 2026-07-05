// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest';

// FZ-5: tema vem de tenants.theme no Supabase
const mockMaybeSingle = vi.fn();
vi.mock('../../lib/supabase', () => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: (...args: any[]) => mockMaybeSingle(...args),
  };
  return { supabase: { from: vi.fn(() => chain) } };
});

import { themeManager } from '../../lib/themeManager';

const themeRow = (theme: any) => ({ data: { theme }, error: null });

describe('themeManager', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    document.documentElement.style.cssText = '';
    themeManager.clearCache();
  });

  it('1. themeManager.load(tenantId) → aplica CSS variable --primary-color com o valor do banco', async () => {
    mockMaybeSingle.mockResolvedValueOnce(themeRow({ primary_color: '#FF0000' }));
    await themeManager.load('t1');
    expect(document.documentElement.style.getPropertyValue('--primary-color')).toBe('#FF0000');
  });

  it('2. Tenant sem primary_color configurado → aplica cor padrão #00C896 sem lançar erro', async () => {
    mockMaybeSingle.mockResolvedValueOnce(themeRow({ secondary_color: '#000000' }));
    await themeManager.load('no-primary');
    expect(document.documentElement.style.getPropertyValue('--primary-color')).toBe('#00C896');
  });

  it('3. Tenant A e B com cores diferentes → CSS variables corretas para cada um (não compartilham)', async () => {
    mockMaybeSingle.mockResolvedValueOnce(themeRow({ primary_color: '#AAAAAA' }));
    await themeManager.load('A');
    expect(document.documentElement.style.getPropertyValue('--primary-color')).toBe('#AAAAAA');

    mockMaybeSingle.mockResolvedValueOnce(themeRow({ primary_color: '#BBBBBB' }));
    await themeManager.load('B');
    expect(document.documentElement.style.getPropertyValue('--primary-color')).toBe('#BBBBBB');
  });

  it('4. logo_url válida → exibida no header (não a logo padrão da Astrum)', async () => {
    mockMaybeSingle.mockResolvedValueOnce(themeRow({ logo_url: '/custom-logo.png' }));
    await themeManager.load('t1');
    expect(document.documentElement.style.getPropertyValue('--logo-url')).toBe('url(/custom-logo.png)');
  });

  it('5. login_background_url ausente → usa background padrão sem quebrar tela de login', async () => {
    mockMaybeSingle.mockResolvedValueOnce(themeRow({ primary_color: '#123123' }));
    await themeManager.load('missing-bg');
    expect(document.documentElement.style.getPropertyValue('--login-background-url')).toBe('url()');
  });

  it('6. Cache em memória → segunda carga do mesmo tenant não busca no banco', async () => {
    mockMaybeSingle.mockResolvedValueOnce(themeRow({ primary_color: '#CACHE' }));
    await themeManager.load('t1');
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);

    await themeManager.load('t1');
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1); // cache hit — sem nova consulta
    expect(document.documentElement.style.getPropertyValue('--primary-color')).toBe('#CACHE');
  });
});
