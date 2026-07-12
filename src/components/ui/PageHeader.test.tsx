import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renderiza título', () => {
    render(<PageHeader title="Clientes" />);
    expect(screen.getByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
  });

  it('renderiza subtítulo quando fornecido', () => {
    render(<PageHeader title="Clientes" subtitle="Gerencie sua base de clientes" />);
    expect(screen.getByText('Gerencie sua base de clientes')).toBeInTheDocument();
  });

  it('não renderiza subtítulo quando ausente', () => {
    const { container } = render(<PageHeader title="Clientes" />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('renderiza slot de ação quando fornecido', () => {
    render(<PageHeader title="Clientes" action={<button>Novo cliente</button>} />);
    expect(screen.getByRole('button', { name: 'Novo cliente' })).toBeInTheDocument();
  });

  it('não renderiza slot de ação quando ausente', () => {
    const { container } = render(<PageHeader title="Clientes" />);
    // Apenas 1 div filho (o de texto) — o shrink-0 de ação não está presente
    const header = container.querySelector('header')!;
    expect(header.children.length).toBe(1);
  });

  it('aplica className extra', () => {
    const { container } = render(<PageHeader title="Título" className="mb-8" />);
    expect(container.querySelector('header')).toHaveClass('mb-8');
  });
});
