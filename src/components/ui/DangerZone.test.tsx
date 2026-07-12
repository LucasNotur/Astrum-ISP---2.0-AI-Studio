import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DangerZone } from './DangerZone';

describe('DangerZone', () => {
  it('renderiza título padrão "Zona de risco"', () => {
    render(
      <DangerZone>
        <button>Excluir conta</button>
      </DangerZone>,
    );
    expect(screen.getByText('Zona de risco')).toBeInTheDocument();
  });

  it('usa título customizado', () => {
    render(
      <DangerZone title="Atenção: ação irreversível">
        <button>Continuar</button>
      </DangerZone>,
    );
    expect(screen.getByText('Atenção: ação irreversível')).toBeInTheDocument();
  });

  it('renderiza descrição quando fornecida', () => {
    render(
      <DangerZone description="Esta ação não pode ser desfeita.">
        <button>OK</button>
      </DangerZone>,
    );
    expect(screen.getByText('Esta ação não pode ser desfeita.')).toBeInTheDocument();
  });

  it('não renderiza parágrafo de descrição quando ausente', () => {
    const { container } = render(
      <DangerZone>
        <button>OK</button>
      </DangerZone>,
    );
    expect(container.querySelector('p')).toBeNull();
  });

  it('renderiza filhos', () => {
    render(
      <DangerZone>
        <button>Excluir tenant</button>
      </DangerZone>,
    );
    expect(screen.getByRole('button', { name: 'Excluir tenant' })).toBeInTheDocument();
  });

  it('aplica className extra no container', () => {
    const { container } = render(
      <DangerZone className="mt-8">
        <span>x</span>
      </DangerZone>,
    );
    expect(container.firstChild).toHaveClass('mt-8');
  });

  it('contém ícone de alerta (aria-hidden visualmente)', () => {
    const { container } = render(
      <DangerZone>
        <span>x</span>
      </DangerZone>,
    );
    // lucide-react renderiza um SVG
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
