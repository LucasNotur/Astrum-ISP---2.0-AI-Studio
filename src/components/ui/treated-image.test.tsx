import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TreatedImage } from './treated-image';

/** D-020 — o tratamento é o que faz imagem de qualquer origem parecer do produto.
 *  O caso mais importante é o SEM imagem: não pode sobrar <img> quebrada na UI. */
describe('TreatedImage', () => {
  it('sem src, não renderiza <img> nenhuma (usa superfície tintada)', () => {
    const { container } = render(<TreatedImage fallbackTint="var(--color-astrum-fiber)" />);
    expect(container.querySelectorAll('img').length).toBe(0);
    expect(container.firstElementChild?.getAttribute('style')).toContain('linear-gradient');
  });

  it('duotone empilha imagem em cinza com multiply sobre a cor de accent', () => {
    const { container } = render(<TreatedImage src="/a.jpg" treatment="duotone" />);
    const img = container.querySelector('img')!;
    expect(img.className).toContain('mix-blend-multiply');
    expect(img.getAttribute('style')).toContain('grayscale(1)');
    expect(container.querySelector('.mix-blend-lighten')).toBeTruthy();
  });

  it('tint preserva as cores originais (sem grayscale) e aplica véu', () => {
    const { container } = render(<TreatedImage src="/a.jpg" treatment="tint" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('style')).toBeNull();
    expect(container.querySelector('.mix-blend-color')).toBeTruthy();
  });

  it('none entrega a imagem crua, sem camadas de mistura', () => {
    const { container } = render(<TreatedImage src="/a.jpg" treatment="none" alt="foto" />);
    expect(container.querySelectorAll('img').length).toBe(1);
    expect(container.querySelector('.mix-blend-lighten')).toBeNull();
    expect(container.querySelector('.mix-blend-color')).toBeNull();
  });

  it('dim apenas escurece por cima da imagem', () => {
    const { container } = render(<TreatedImage src="/a.jpg" treatment="dim" />);
    const img = container.querySelector('img')!;
    expect(img.className).not.toContain('mix-blend');
    expect(container.querySelectorAll('div').length).toBeGreaterThan(1);
  });

  it('sempre carrega em lazy (assets de produto não podem travar a primeira pintura)', () => {
    const { container } = render(<TreatedImage src="/a.jpg" />);
    expect(container.querySelector('img')?.getAttribute('loading')).toBe('lazy');
  });
});
