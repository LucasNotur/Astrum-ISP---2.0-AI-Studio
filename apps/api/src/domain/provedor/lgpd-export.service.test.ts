import { describe, it, expect, vi } from 'vitest';
import { exportCustomerByEmail, type LgpdExportDb } from './lgpd-export.service';

const TENANT = 't-1';

function makeDb(overrides: Partial<LgpdExportDb> = {}): LgpdExportDb {
  return {
    findCustomerIdsByEmail: vi.fn(async () => ['c-1']),
    getCustomers: vi.fn(async () => [{ id: 'c-1', name: 'Ana', email: 'ana@x.com' }]),
    getInvoices: vi.fn(async () => [{ id: 'i-1', amount_cents: 9999 }, { id: 'i-2', amount_cents: 9999 }]),
    getServiceOrders: vi.fn(async () => [{ id: 'os-1' }]),
    getTickets: vi.fn(async () => [{ id: 'tk-1' }]),
    getMessages: vi.fn(async () => [{ id: 'm-1', content: 'oi' }]),
    ...overrides,
  };
}

describe('exportCustomerByEmail', () => {
  it('monta o pacote com todas as tabelas e contagens corretas', async () => {
    const db = makeDb();
    const out = await exportCustomerByEmail(db, TENANT, ' ana@x.com ');
    expect(out.found).toBe(true);
    expect(out.email).toBe('ana@x.com'); // trim aplicado
    expect(out.customerIds).toEqual(['c-1']);
    expect(out.counts).toEqual({ customers: 1, invoices: 2, serviceOrders: 1, tickets: 1, messages: 1 });
    expect(out.data.invoices).toHaveLength(2);
    expect(out.data.messages[0].content).toBe('oi');
    // todas as consultas recebem o tenant escopado
    expect(db.getInvoices).toHaveBeenCalledWith(TENANT, ['c-1']);
    expect(db.getMessages).toHaveBeenCalledWith(TENANT, ['c-1']);
  });

  it('e-mail vazio → found=false sem consultar nada', async () => {
    const db = makeDb();
    const out = await exportCustomerByEmail(db, TENANT, '   ');
    expect(out.found).toBe(false);
    expect(db.findCustomerIdsByEmail).not.toHaveBeenCalled();
    expect(out.counts.customers).toBe(0);
  });

  it('e-mail sem titular → found=false e não busca dados dependentes', async () => {
    const db = makeDb({ findCustomerIdsByEmail: vi.fn(async () => []) });
    const out = await exportCustomerByEmail(db, TENANT, 'ninguem@x.com');
    expect(out.found).toBe(false);
    expect(db.getInvoices).not.toHaveBeenCalled();
    expect(db.getMessages).not.toHaveBeenCalled();
    expect(out.data.customers).toEqual([]);
  });
});
