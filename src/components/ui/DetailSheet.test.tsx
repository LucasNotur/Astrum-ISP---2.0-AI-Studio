import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetailSheet } from './DetailSheet';

function renderSheet(overrides = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    title: 'Detalhe do cliente',
    children: <p>Conteúdo do painel</p>,
    ...overrides,
  };
  return { ...render(<DetailSheet {...props} />), onClose: props.onClose };
}

describe('DetailSheet', () => {
  it('exibe título e conteúdo quando open=true', () => {
    renderSheet();
    expect(screen.getByText('Detalhe do cliente')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo do painel')).toBeInTheDocument();
  });

  it('exibe subtítulo quando fornecido', () => {
    renderSheet({ subtitle: 'CPF: 000.000.000-00' });
    expect(screen.getByText('CPF: 000.000.000-00')).toBeInTheDocument();
  });

  it('chama onClose ao clicar no backdrop', () => {
    const { onClose } = renderSheet();
    // backdrop é o primeiro div com aria-hidden
    const backdrop = document.querySelector('[aria-hidden="true"]')!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('chama onClose ao clicar no botão de fechar', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('chama onClose ao pressionar Escape', () => {
    const { onClose } = renderSheet();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renderiza footer quando fornecido', () => {
    renderSheet({ footer: <button>Salvar</button> });
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('painel tem role=dialog e aria-modal=true', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Detalhe do cliente');
  });

  it('remove o listener de Escape ao fechar (open=false)', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <DetailSheet open={false} onClose={onClose} title="X">
        <p>Conteúdo</p>
      </DetailSheet>,
    );
    rerender(
      <DetailSheet open={true} onClose={onClose} title="X">
        <p>Conteúdo</p>
      </DetailSheet>,
    );
    rerender(
      <DetailSheet open={false} onClose={onClose} title="X">
        <p>Conteúdo</p>
      </DetailSheet>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
