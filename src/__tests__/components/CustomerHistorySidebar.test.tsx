// @vitest-environment jsdom
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// FZ-5: o componente lê customers/tickets/service_orders via Supabase.
// Mock com resultados controláveis por tabela.
const tableResults: Record<string, any> = {};

vi.mock('../../lib/supabase', () => {
  function makeChain(table: string) {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      maybeSingle: async () => ({ data: tableResults[table]?.single ?? null, error: null }),
      then: (resolve: any) =>
        Promise.resolve({ data: tableResults[table]?.rows ?? [], error: null }).then(resolve),
    };
    return chain;
  }
  const channelStub: any = { on: vi.fn(() => channelStub), subscribe: vi.fn(() => channelStub) };
  return {
    supabase: {
      from: (table: string) => makeChain(table),
      channel: vi.fn(() => channelStub),
      removeChannel: vi.fn(),
    },
  };
});

import { CustomerHistorySidebar } from '../../components/CustomerHistorySidebar';

describe('CustomerHistorySidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(tableResults)) delete tableResults[k];
  });

  const mockCustomer = {
    id: 'cust1',
    name: 'João Silva',
    tenant_id: 'tenant1',
    hardware: [{ model: 'Router XPTO', mac: '00:11:22:33:44:55', status: 'ativo' }]
  };

  const mockTickets = [
    { id: 'tick2', customer_id: 'cust1', subject: 'Sem Sinal', created_at: '2023-01-02T10:00:00Z', status: 'open' },
    { id: 'tick1', customer_id: 'cust1', subject: 'Internet Lenta', created_at: '2023-01-01T10:00:00Z', status: 'resolved' },
  ];

  it('1. CustomerHistorySidebar com customerId válido → carrega cliente e tickets', async () => {
    tableResults['customers'] = { single: mockCustomer };
    tableResults['tickets'] = { rows: [mockTickets[1]] };
    tableResults['service_orders'] = { rows: [] };

    render(<CustomerHistorySidebar customerId="cust1" tenantId="tenant1" onEditCustomer={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument();
      expect(screen.getByText('Internet Lenta')).toBeInTheDocument();
    });
  });

  it('2. Sem dados → mostra "Nenhum atendimento anterior" (sem vazamento)', async () => {
    tableResults['customers'] = { single: null };
    tableResults['tickets'] = { rows: [] };
    tableResults['service_orders'] = { rows: [] };

    render(<CustomerHistorySidebar customerId="cust1" tenantId="tenant2" onEditCustomer={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText('Internet Lenta')).not.toBeInTheDocument();
      expect(screen.getByText('Nenhum atendimento anterior')).toBeInTheDocument();
    });
  });

  it('3. Tickets carregados na ordem devolvida pelo banco (desc)', async () => {
    tableResults['customers'] = { single: mockCustomer };
    tableResults['tickets'] = { rows: mockTickets };
    tableResults['service_orders'] = { rows: [] };

    render(<CustomerHistorySidebar customerId="cust1" tenantId="tenant1" onEditCustomer={() => {}} />);

    await waitFor(() => {
      const subjects = screen.getAllByText(/^(Sem Sinal|Internet Lenta)$/);
      expect(subjects[0]).toHaveTextContent('Sem Sinal');
      expect(subjects[1]).toHaveTextContent('Internet Lenta');
    });
  });

  it('4. Cliente sem histórico → mensagem amigável sem lançar erro', async () => {
    tableResults['customers'] = { single: { id: 'cust2', name: 'Maria Souza' } };
    tableResults['tickets'] = { rows: [] };
    tableResults['service_orders'] = { rows: [] };

    render(<CustomerHistorySidebar customerId="cust2" tenantId="tenant1" onEditCustomer={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Maria Souza')).toBeInTheDocument();
      expect(screen.getByText('Nenhum atendimento anterior')).toBeInTheDocument();
    });
  });

  it('5. Sem hardware registrado → seção não renderiza mas componente não quebra', async () => {
    tableResults['customers'] = { single: { id: 'cust3', name: 'Pedro' } };
    tableResults['tickets'] = { rows: [] };
    tableResults['service_orders'] = { rows: [] };

    render(<CustomerHistorySidebar customerId="cust3" tenantId="tenant1" onEditCustomer={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Pedro')).toBeInTheDocument();
      expect(screen.queryByText('Equipamentos Registrados')).not.toBeInTheDocument();
    });
  });
});
