import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskBadge } from './RiskBadge';

describe('RiskBadge', () => {
  it('renderiza o texto padrão do nível', () => {
    render(<RiskBadge level="critico" />);
    expect(screen.getByText('Crítico')).toBeInTheDocument();
  });

  it('aceita label customizado', () => {
    render(<RiskBadge level="baixo" label="OK" />);
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('renderiza ponto colorido com aria implícito', () => {
    const { container } = render(<RiskBadge level="medio" />);
    expect(container.querySelector('span > span')).toHaveClass('bg-astrum-amber');
  });
});
