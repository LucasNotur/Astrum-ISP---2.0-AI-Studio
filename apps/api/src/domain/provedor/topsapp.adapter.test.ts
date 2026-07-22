import { describe, it, expect, vi } from 'vitest';
import {
  listCustomers, getCustomer, listInvoices, createServiceOrder,
  normalizeStatus, TopSappConfig, TopSappPorts, TopSappCustomer, TopSappInvoice,
} from './topsapp.adapter';

const CONFIG: TopSappConfig = {
  baseUrl: 'https://api.topsapp.test', apiKey: 'key-123', tenantId: 't1',
};

const CUSTOMER: TopSappCustomer = {
  id: 'cust-1', name: 'João', cpfCnpj: '12345678901',
  email: 'joao@test.com', status: 'active', plan: 'fibra-100',
};

const INVOICES: TopSappInvoice[] = [
  { id: 'inv-1', customerId: 'cust-1', amount: 99.9, dueDate: '2026-08-10', status: 'open' },
];

function makePorts(): TopSappPorts {
  return {
    httpGet: vi.fn().mockResolvedValue([CUSTOMER]),
    httpPost: vi.fn().mockResolvedValue({ id: 'os-1', customerId: 'cust-1', type: 'instalação', description: 'Instalar fibra', status: 'open' }),
  };
}

describe('topsapp.adapter', () => {
  describe('listCustomers', () => {
    it('busca clientes com auth header', async () => {
      const ports = makePorts();
      const result = await listCustomers(CONFIG, ports);
      expect(result).toEqual([CUSTOMER]);
      expect(ports.httpGet).toHaveBeenCalledWith(
        'https://api.topsapp.test/api/v1/customers',
        expect.objectContaining({ Authorization: 'Bearer key-123' }),
      );
    });
  });

  describe('getCustomer', () => {
    it('retorna cliente por ID', async () => {
      const ports = makePorts();
      (ports.httpGet as any).mockResolvedValue(CUSTOMER);
      const result = await getCustomer(CONFIG, 'cust-1', ports);
      expect(result?.name).toBe('João');
    });

    it('retorna null quando não encontrado', async () => {
      const ports = makePorts();
      (ports.httpGet as any).mockRejectedValue(new Error('404'));
      const result = await getCustomer(CONFIG, 'nope', ports);
      expect(result).toBeNull();
    });
  });

  describe('listInvoices', () => {
    it('busca faturas do cliente', async () => {
      const ports = makePorts();
      (ports.httpGet as any).mockResolvedValue(INVOICES);
      const result = await listInvoices(CONFIG, 'cust-1', ports);
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(99.9);
    });
  });

  describe('createServiceOrder', () => {
    it('cria OS com status open', async () => {
      const ports = makePorts();
      const result = await createServiceOrder(CONFIG, { customerId: 'cust-1', type: 'instalação', description: 'Instalar fibra' }, ports);
      expect(result.status).toBe('open');
      expect(ports.httpPost).toHaveBeenCalledWith(
        'https://api.topsapp.test/api/v1/service-orders',
        expect.objectContaining({ status: 'open' }),
        expect.any(Object),
      );
    });
  });

  describe('normalizeStatus', () => {
    it('ativo → active', () => expect(normalizeStatus('ativo')).toBe('active'));
    it('Suspenso → suspended', () => expect(normalizeStatus('Suspenso')).toBe('suspended'));
    it('bloqueado → suspended', () => expect(normalizeStatus('bloqueado')).toBe('suspended'));
    it('cancelado → cancelled', () => expect(normalizeStatus('cancelado')).toBe('cancelled'));
    it('desconhecido → unknown', () => expect(normalizeStatus('xyz')).toBe('unknown'));
  });
});
