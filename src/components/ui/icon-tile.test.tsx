import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { IconTile, TileRow } from './icon-tile';

describe('IconTile', () => {
  it('aplica o tom semântico como cor de texto do ícone', () => {
    const { container } = render(<IconTile icon={<i data-testid="i" />} tone="signal" />);
    expect(container.firstElementChild?.className).toContain('text-astrum-signal');
  });

  it('usa a superfície neutra quando não recebe tom', () => {
    const { container } = render(<IconTile icon={<i />} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('bg-secondary');
    // tom neutro não pinta fundo inline
    expect(el.getAttribute('style')).toBeNull();
  });

  it('vira círculo quando pedido', () => {
    const { container } = render(<IconTile icon={<i />} shape="circle" />);
    expect(container.firstElementChild?.className).toContain('rounded-full');
  });
});

describe('TileRow', () => {
  it('renderiza título, subtítulo e valor', () => {
    const { getByText } = render(
      <TileRow icon={<i />} title="Estoque" subtitle="12 itens críticos" value="128" />
    );
    expect(getByText('Estoque')).toBeTruthy();
    expect(getByText('12 itens críticos')).toBeTruthy();
    expect(getByText('128')).toBeTruthy();
  });

  it('vira botão clicável quando recebe onClick', () => {
    const onClick = vi.fn();
    const { getByRole } = render(<TileRow icon={<i />} title="Abrir" onClick={onClick} />);
    fireEvent.click(getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
