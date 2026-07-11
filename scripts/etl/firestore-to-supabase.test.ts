import { describe, it, expect, vi } from 'vitest';
import { migrateCustomers, migrateInvoices, runTenantBackfill, type EtlDeps } from './firestore-to-supabase';

function makeDeps(overrides: Partial<EtlDeps> = {}): EtlDeps {
  return {
    fetchCollection: vi.fn().mockResolvedValue([]),
    fetchExistingLegacyIds: vi.fn().mockResolvedValue(new Set()),
    insertRows: vi.fn().mockResolvedValue(undefined),
    updateRowByLegacyId: vi.fn().mockResolvedValue(undefined),
    resolveCustomerUuid: vi.fn().mockResolvedValue('uuid-1'),
    log: vi.fn(),
    ...overrides,
  };
}

describe('ETL orchestrator — customers', () => {
  it('primeira execução insere todos', async () => {
    const deps = makeDeps({
      fetchCollection: vi.fn().mockResolvedValue([
        { id: 'c1', name: 'A', mrr: 100, status: 'active' },
        { id: 'c2', name: 'B', mrr: 50, status: 'inactive' },
      ]),
    });
    const res = await migrateCustomers(deps, { tenantId: 't1', dryRun: false });
    expect(res.inserted).toBe(2);
    expect(res.updated).toBe(0);
    expect(deps.insertRows).toHaveBeenCalledOnce();
  });

  it('dry-run NÃO escreve no destino', async () => {
    const deps = makeDeps({
      fetchCollection: vi.fn().mockResolvedValue([{ id: 'c1', name: 'A', mrr: 10, status: 'active' }]),
    });
    const res = await migrateCustomers(deps, { tenantId: 't1', dryRun: true });
    expect(res.inserted).toBe(1); // planejou
    expect(deps.insertRows).not.toHaveBeenCalled(); // mas não escreveu
    expect(deps.updateRowByLegacyId).not.toHaveBeenCalled();
  });

  it('reexecução (legacy_ids já existem) vira UPDATE — não duplica', async () => {
    const deps = makeDeps({
      fetchCollection: vi.fn().mockResolvedValue([{ id: 'c1', name: 'A', mrr: 10, status: 'active' }]),
      fetchExistingLegacyIds: vi.fn().mockResolvedValue(new Set(['c1'])),
    });
    const res = await migrateCustomers(deps, { tenantId: 't1', dryRun: false });
    expect(res.inserted).toBe(0);
    expect(res.updated).toBe(1);
    expect(deps.insertRows).not.toHaveBeenCalled();
  });
});

describe('ETL orchestrator — invoices', () => {
  it('resolve FK de customer por legacy_id e converte valor', async () => {
    const resolve = vi.fn().mockResolvedValue('cust-uuid-9');
    const insert = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      fetchCollection: vi.fn().mockResolvedValue([
        { id: 'inv1', customerId: 'c1', amount: 149.9, paymentUrl: 'https://p/1', pixCopyPaste: 'PIX1' },
      ]),
      resolveCustomerUuid: resolve,
      insertRows: insert,
    });
    const res = await migrateInvoices(deps, { tenantId: 't1', dryRun: false });
    expect(res.inserted).toBe(1);
    expect(resolve).toHaveBeenCalledWith('t1', 'c1');
    const rowInserted = (insert.mock.calls[0][1] as any[])[0];
    expect(rowInserted.amount_cents).toBe(14990);
    expect(rowInserted.customer_id).toBe('cust-uuid-9');
    expect(rowInserted.pix_copy_paste).toBe('PIX1');
  });
});

describe('ETL orchestrator — pipeline', () => {
  it('runTenantBackfill retorna relatório por todas as entidades (ordem de FK)', async () => {
    const deps = makeDeps();
    const results = await runTenantBackfill(deps, { tenantId: 't1', dryRun: true });
    expect(results.map((r) => r.entity)).toEqual([
      'customers', 'invoices', 'network_ctos', 'technicians',
      'inventory', 'team_members', 'service_orders', 'notifications',
    ]);
  });
});
