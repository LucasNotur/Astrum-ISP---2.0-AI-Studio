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

// F1-D: o componente lê customer/tickets/service-orders via apps/api
// (GET /api/v2/customers/:id[, /tickets, /service-orders]). Mock por rota.
const routeResults: Record<string, any> = {};

vi.mock('../../lib/apiClient', () => ({
  apiGet: vi.fn((path: string) => {
    if (path.endsWith('/tickets')) return Promise.resolve(routeResults.tickets ?? []);
    if (path.endsWith('/service-orders')) return Promise.resolve(routeResults.serviceOrders ?? []);
    if (routeResults.customer === null) return Promise.reject(new Error('not found'));
    return Promise.resolve(routeResults.customer ?? null);
  }),
}));

import { CustomerHistorySidebar } from '../../components/CustomerHistorySidebar';

describe('CustomerHistorySidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(routeResults)) delete routeResults[k];
  });

  const mockCustomer = {
    id: 'cust1',
    name: 'João Silva',
    tenant_id: 'tenant1',
    hardware: [{ model: 'Router XPTO', mac: '00:11:22:33:44:55', status: 'ativo' }]
  };

  const mockTickets = [
    { id: 'tick2', customer_id: 'cust1', title: 'Sem Sinal', created_at: '2023-01-02T10:00:00Z', status: 'open' },
    { id: 'tick1', customer_id: 'cust1', title: 'Internet Lenta', created_at: '2023-01-01T10:00:00Z', status: 'resolved' },
  ];

  it('1. CustomerHistorySidebar com customerId válido → carrega cliente e tickets', async () => {
    routeResults.customer = mockCustomer;
    routeResults.tickets = [mockTickets[1]];
    routeResults.serviceOrders = [];

    render(<CustomerHistorySidebar customerId="cust1" tenantId="tenant1" onEditCustomer={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument();
      expect(screen.getByText('Internet Lenta')).toBeInTheDocument();
    });
  });

  it('2. Sem dados → mostra "Nenhum atendimento anterior" (sem vazamento)', async () => {
    routeResults.customer = null;
    routeResults.tickets = [];
    routeResults.serviceOrders = [];

    render(<CustomerHistorySidebar customerId="cust1" tenantId="tenant2" onEditCustomer={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText('Internet Lenta')).not.toBeInTheDocument();
      expect(screen.getByText('Nenhum atendimento anterior')).toBeInTheDocument();
    });
  });

  it('3. Tickets carregados na ordem devolvida pelo backend (desc)', async () => {
    routeResults.customer = mockCustomer;
    routeResults.tickets = mockTickets;
    routeResults.serviceOrders = [];

    render(<CustomerHistorySidebar customerId="cust1" tenantId="tenant1" onEditCustomer={() => {}} />);

    await waitFor(() => {
      const subjects = screen.getAllByText(/^(Sem Sinal|Internet Lenta)$/);
      expect(subjects[0]).toHaveTextContent('Sem Sinal');
      expect(subjects[1]).toHaveTextContent('Internet Lenta');
    });
  });

  it('4. Cliente sem histórico → mensagem amigável sem lançar erro', async () => {
    routeResults.customer = { id: 'cust2', name: 'Maria Souza' };
    routeResults.tickets = [];
    routeResults.serviceOrders = [];

    render(<CustomerHistorySidebar customerId="cust2" tenantId="tenant1" onEditCustomer={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Maria Souza')).toBeInTheDocument();
      expect(screen.getByText('Nenhum atendimento anterior')).toBeInTheDocument();
    });
  });

  it('5. Sem hardware registrado → seção não renderiza mas componente não quebra', async () => {
    routeResults.customer = { id: 'cust3', name: 'Pedro' };
    routeResults.tickets = [];
    routeResults.serviceOrders = [];

    render(<CustomerHistorySidebar customerId="cust3" tenantId="tenant1" onEditCustomer={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Pedro')).toBeInTheDocument();
      expect(screen.queryByText('Equipamentos Registrados')).not.toBeInTheDocument();
    });
  });
});
