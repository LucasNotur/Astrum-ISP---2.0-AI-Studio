import { describe, it, expect } from 'vitest';
import { exportData, ExportPorts, ExportRequest } from './data-export.service';

const ROWS = [
  { id: '1', name: 'João Silva', cpf: '111.222.333-44', plan: 'pro' },
  { id: '2', name: 'Maria Santos', cpf: '555.666.777-88', plan: 'starter' },
];

function makePorts(rows = ROWS): ExportPorts {
  return {
    queryRows: async (tenantId, entity, dateFrom, dateTo, limit) => {
      expect(tenantId).toBeTruthy();
      return rows.slice(0, limit);
    },
  };
}

describe('data-export.service', () => {
  it('exporta JSON com todos os campos', async () => {
    const req: ExportRequest = { tenantId: 't1', entity: 'customers', format: 'json' };
    const result = await exportData(req, makePorts());
    expect(result.format).toBe('json');
    expect(result.rowCount).toBe(2);
    const parsed = JSON.parse(result.content);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('João Silva');
    expect(result.filename).toMatch(/^customers_\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('exporta CSV com headers e escape de vírgulas', async () => {
    const rows = [
      { id: '1', desc: 'Plano básico, 50Mbps', value: 89.9 },
      { id: '2', desc: 'Plano "premium"', value: 149.9 },
    ];
    const req: ExportRequest = { tenantId: 't1', entity: 'invoices', format: 'csv' };
    const result = await exportData(req, makePorts(rows));
    expect(result.format).toBe('csv');
    const lines = result.content.split('\n');
    expect(lines[0]).toBe('id,desc,value');
    expect(lines[1]).toContain('"Plano básico, 50Mbps"');
    expect(lines[2]).toContain('"Plano ""premium"""');
    expect(result.filename).toMatch(/\.csv$/);
  });

  it('retorna vazio quando sem dados', async () => {
    const req: ExportRequest = { tenantId: 't1', entity: 'tickets', format: 'csv' };
    const result = await exportData(req, makePorts([]));
    expect(result.rowCount).toBe(0);
    expect(result.content).toBe('');
  });

  it('respeita limit do request', async () => {
    const req: ExportRequest = { tenantId: 't1', entity: 'customers', format: 'json', limit: 1 };
    const result = await exportData(req, makePorts());
    expect(result.rowCount).toBe(1);
  });

  it('default limit é 10000', async () => {
    let capturedLimit = 0;
    const ports: ExportPorts = {
      queryRows: async (_t, _e, _df, _dt, limit) => { capturedLimit = limit!; return []; },
    };
    await exportData({ tenantId: 't1', entity: 'conversations', format: 'json' }, ports);
    expect(capturedLimit).toBe(10000);
  });
});
