// @vitest-environment jsdom
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CustomerHistorySidebar } from '../../components/CustomerHistorySidebar';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { onSnapshot, collection, query, where } from 'firebase/firestore';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn((db, path) => path),
  query: vi.fn((col, ...args) => ({ col, args })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  onSnapshot: vi.fn(),
}));

vi.mock('../../lib/firebase', () => ({
  db: {}
}));

describe('CustomerHistorySidebar', () => {
  let snapshotCallbacks: Record<string, Function> = {};
  
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotCallbacks = {};
    
    (onSnapshot as Mock).mockImplementation((queryOrCol, callback) => {
      let colName = queryOrCol;
      if (queryOrCol.col) colName = queryOrCol.col;
      
      snapshotCallbacks[colName] = callback;
      return vi.fn();
    });
  });

  const mockCustomer = {
    id: 'cust1',
    name: 'João Silva',
    tenant_id: 'tenant1',
    hardware: [{ model: 'Router XPTO', mac: '00:11:22:33:44:55', status: 'ativo' }]
  };

  const mockTickets = [
    {
      id: 'tick1',
      customerId: 'cust1',
      tenantId: 'tenant1',
      subject: 'Internet Lenta',
      createdAt: new Date('2023-01-01T10:00:00Z'),
      status: 'resolved'
    },
    {
      id: 'tick2',
      customerId: 'cust1',
      tenantId: 'tenant1',
      subject: 'Sem Sinal',
      createdAt: new Date('2023-01-02T10:00:00Z'),
      status: 'open'
    }
  ];

  function triggerCustomerCb(customer: any) {
    if (snapshotCallbacks['customers']) {
      snapshotCallbacks['customers']({
        docs: customer ? [{ id: customer.id, data: () => customer }] : []
      });
    }
  }

  function triggerTicketsCb(tickets: any[]) {
    if (snapshotCallbacks['tickets']) {
      snapshotCallbacks['tickets']({
        docs: tickets.map(t => ({ id: t.id, data: () => t }))
      });
    }
  }

  function triggerOsCb(osList: any[]) {
    if (snapshotCallbacks['serviceOrders']) {
      snapshotCallbacks['serviceOrders']({
        docs: osList.map(o => ({ id: o.id, data: () => o }))
      });
    }
  }

  it('1. CustomerHistorySidebar with valid customerId -> loads past tickets filtered by tenant_id', async () => {
    render(<CustomerHistorySidebar customerId="cust1" tenantId="tenant1" onEditCustomer={() => {}} />);
    
    triggerCustomerCb(mockCustomer);
    triggerTicketsCb([mockTickets[0]]);
    
    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument();
      expect(screen.getByText('Internet Lenta')).toBeInTheDocument();
    });

    const tsCalls = (query as Mock).mock.calls.filter(c => c[0] === 'tickets');
    expect(tsCalls[0]).toEqual(expect.arrayContaining([
       'tickets',
       { field: 'customerId', op: '==', val: 'cust1' },
       { field: 'tenantId', op: '==', val: 'tenant1' }
    ]));
  });

  it('2. Sidebar with customerId of another tenant -> 0 results (no data leak)', async () => {
    render(<CustomerHistorySidebar customerId="cust1" tenantId="tenant2" onEditCustomer={() => {}} />);
    
    triggerCustomerCb(null);
    triggerTicketsCb([]);
    
    await waitFor(() => {
        expect(screen.queryByText('Internet Lenta')).not.toBeInTheDocument();
        expect(screen.getByText('Nenhum atendimento anterior')).toBeInTheDocument();
    });
  });

  it('3. Loaded tickets -> ordered by descending date', async () => {
    render(<CustomerHistorySidebar customerId="cust1" tenantId="tenant1" onEditCustomer={() => {}} />);
    
    triggerCustomerCb(mockCustomer);
    triggerTicketsCb(mockTickets);
    
    await waitFor(() => {
       const subjects = screen.getAllByText(/^(Sem Sinal|Internet Lenta)$/);
       expect(subjects[0]).toHaveTextContent('Sem Sinal');
       expect(subjects[1]).toHaveTextContent('Internet Lenta');
    });
  });

  it('4. Customer with no history -> shows message Nenhum atendimento anterior sem lançar erro', async () => {
    render(<CustomerHistorySidebar customerId="cust2" tenantId="tenant1" onEditCustomer={() => {}} />);
    
    triggerCustomerCb({ id: 'cust2', name: 'Maria Souza' });
    triggerTicketsCb([]);
    
    await waitFor(() => {
       expect(screen.getByText('Maria Souza')).toBeInTheDocument();
       expect(screen.getByText('Nenhum atendimento anterior')).toBeInTheDocument();
    });
  });

  it("5. Missing registered hardware -> section doesn't render but component doesn't crash", async () => {
    render(<CustomerHistorySidebar customerId="cust3" tenantId="tenant1" onEditCustomer={() => {}} />);
    
    triggerCustomerCb({ id: 'cust3', name: 'Pedro' });
    triggerTicketsCb([]);
    
    await waitFor(() => {
       expect(screen.getByText('Pedro')).toBeInTheDocument();
       expect(screen.queryByText('Equipamentos Registrados')).not.toBeInTheDocument();
    });
  });

  it('6. Firestore onSnapshot -> updates in real time on new ticket', async () => {
    render(<CustomerHistorySidebar customerId="cust1" tenantId="tenant1" onEditCustomer={() => {}} />);
    
    triggerCustomerCb(mockCustomer);
    triggerTicketsCb([mockTickets[0]]);
    
    await waitFor(() => {
        expect(screen.getByText('Internet Lenta')).toBeInTheDocument();
    });
    
    triggerTicketsCb([mockTickets[0], mockTickets[1]]);
    
    await waitFor(() => {
        expect(screen.getByText('Sem Sinal')).toBeInTheDocument();
    });
  });

  it('7. Collapsed sidebar -> no Firestore calls (lazy loading)', async () => {
    const { container, rerender } = render(<CustomerHistorySidebar customerId="cust1" tenantId="tenant1" onEditCustomer={() => {}} />);
    
    expect(onSnapshot).toHaveBeenCalled();
    vi.clearAllMocks();

    const closeBtn = container.querySelector('.lucide-chevron-right')?.parentElement;
    if (closeBtn) {
        fireEvent.click(closeBtn);
    }
    
    rerender(<CustomerHistorySidebar customerId="cust1" tenantId="tenant2" onEditCustomer={() => {}} />);
    
    expect(onSnapshot).not.toHaveBeenCalled();
  });
});
