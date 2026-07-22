/**
 * Dossiê #47 — Exportador de banco nativo JSON/CSV.
 * Permite ao ISP exportar seus dados (customers, invoices, tickets, conversations)
 * em formato JSON ou CSV. Respeita RLS (só dados do tenant).
 */

export type ExportFormat = 'json' | 'csv';
export type ExportEntity = 'customers' | 'invoices' | 'tickets' | 'conversations' | 'service_orders';

export interface ExportRequest {
  tenantId: string;
  entity: ExportEntity;
  format: ExportFormat;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export interface ExportResult {
  entity: ExportEntity;
  format: ExportFormat;
  rowCount: number;
  content: string;
  filename: string;
}

export interface ExportPorts {
  queryRows: (tenantId: string, entity: ExportEntity, dateFrom?: string, dateTo?: string, limit?: number) => Promise<Record<string, unknown>[]>;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ];
  return lines.join('\n');
}

export async function exportData(req: ExportRequest, ports: ExportPorts): Promise<ExportResult> {
  const rows = await ports.queryRows(req.tenantId, req.entity, req.dateFrom, req.dateTo, req.limit ?? 10000);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${req.entity}_${timestamp}.${req.format}`;

  const content = req.format === 'json'
    ? JSON.stringify(rows, null, 2)
    : toCsv(rows);

  return { entity: req.entity, format: req.format, rowCount: rows.length, content, filename };
}
