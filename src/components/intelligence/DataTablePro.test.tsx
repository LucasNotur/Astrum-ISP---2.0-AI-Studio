import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTablePro } from './DataTablePro';

describe('DataTablePro', () => {
  const data = [
    { id: 1, name: 'Alpha', risk: 'baixo' as const },
    { id: 2, name: 'Beta', risk: 'alto' as const },
    { id: 3, name: 'Gamma', risk: 'critico' as const },
  ];

  const columns = [
    { key: 'name', header: 'Nome' },
    {
      key: 'risk',
      header: 'Risco',
      riskAccessor: (row: (typeof data)[0]) => row.risk,
    },
  ];

  it('renderiza linhas e badges de risco', () => {
    render(<DataTablePro columns={columns} data={data} pageSize={2} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Baixo')).toBeInTheDocument();
    expect(screen.getByText('Alto')).toBeInTheDocument();
  });

  it('pagina corretamente', () => {
    render(<DataTablePro columns={columns} data={data} pageSize={2} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Gamma')).not.toBeInTheDocument();

    const next = screen.getByLabelText('Próxima página');
    fireEvent.click(next);

    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('renderiza emptyState quando não há dados', () => {
    render(
      <DataTablePro
        columns={columns}
        data={[]}
        emptyState={<div data-testid="empty">Vazio</div>}
      />,
    );
    expect(screen.getByTestId('empty')).toBeInTheDocument();
  });
});
