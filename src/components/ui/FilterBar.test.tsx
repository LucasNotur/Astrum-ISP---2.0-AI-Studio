import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterBar } from './FilterBar';

describe('FilterBar', () => {
  it('renderiza o campo de busca com placeholder padrão', () => {
    render(<FilterBar />);
    expect(screen.getByPlaceholderText('Buscar...')).toBeInTheDocument();
  });

  it('usa placeholder customizado', () => {
    render(<FilterBar placeholder="Buscar clientes..." />);
    expect(screen.getByPlaceholderText('Buscar clientes...')).toBeInTheDocument();
  });

  it('exibe valor controlado', () => {
    render(<FilterBar value="ativo" />);
    expect(screen.getByDisplayValue('ativo')).toBeInTheDocument();
  });

  it('chama onValueChange ao digitar', () => {
    const handler = vi.fn();
    render(<FilterBar onValueChange={handler} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'joão' } });
    expect(handler).toHaveBeenCalledWith('joão');
  });

  it('renderiza slot de filtros quando fornecido', () => {
    render(<FilterBar filters={<button>Status</button>} />);
    expect(screen.getByRole('button', { name: 'Status' })).toBeInTheDocument();
  });

  it('renderiza slot de ordenação quando fornecido', () => {
    render(<FilterBar sort={<button>Ordenar</button>} />);
    expect(screen.getByRole('button', { name: 'Ordenar' })).toBeInTheDocument();
  });
});
