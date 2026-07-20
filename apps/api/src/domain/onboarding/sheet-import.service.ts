/**
 * F6-03 — Import de planilha (CSV → customers).
 *
 * Mapeia colunas comuns (nome/cpf/telefone/plano/valor/vencimento),
 * grava customers com extra.imported_from='sheet', dedupe por CPF.
 *
 * Parser CSV simples (sem dependência externa no backend — papaparse é
 * frontend-only). Suporta ; e , como delimitador.
 */
import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SheetRow {
  [key: string]: string;
}

export interface ColumnMapping {
  name: string;
  cpf: string;
  phone?: string;
  plan?: string;
  amount?: string;
  due_day?: string;
}

export interface SheetImportResult {
  totalRows: number;
  imported: number;
  duplicatesSkipped: number;
  errors: Array<{ row: number; reason: string }>;
}

export interface SheetImportPorts {
  db: typeof supabase;
}

// ── CSV Parser ──────────────────────────────────────────────────────────────

export function parseCSV(raw: string): SheetRow[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const delimiter = (lines[0]!.match(/;/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? ';' : ',';
  const headers = lines[0]!.split(delimiter).map((h) => h.trim().replace(/^"(.*)"$/, '$1').toLowerCase());

  return lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((v) => v.trim().replace(/^"(.*)"$/, '$1'));
    const row: SheetRow = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row;
  });
}

function cleanCpf(raw: string): string {
  return raw.replace(/\D/g, '').padStart(11, '0');
}

function cleanPhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

// ── Import logic ────────────────────────────────────────────────────────────

export async function importSheet(
  tenantId: string,
  rows: SheetRow[],
  mapping: ColumnMapping,
  ports: SheetImportPorts = { db: supabase },
): Promise<SheetImportResult> {
  const result: SheetImportResult = {
    totalRows: rows.length,
    imported: 0,
    duplicatesSkipped: 0,
    errors: [],
  };

  const seenCpfs = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const name = row[mapping.name]?.trim();
    const rawCpf = row[mapping.cpf]?.trim();

    if (!name || !rawCpf) {
      result.errors.push({ row: i + 2, reason: 'nome ou CPF vazio' });
      continue;
    }

    const cpf = cleanCpf(rawCpf);
    if (cpf.length < 11) {
      result.errors.push({ row: i + 2, reason: `CPF inválido: ${rawCpf}` });
      continue;
    }

    if (seenCpfs.has(cpf)) {
      result.duplicatesSkipped++;
      continue;
    }
    seenCpfs.add(cpf);

    const { data: existing } = await ports.db
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('cpf', cpf)
      .maybeSingle();

    if (existing) {
      result.duplicatesSkipped++;
      continue;
    }

    const phone = mapping.phone ? cleanPhone(row[mapping.phone] ?? '') : '';

    const { error } = await ports.db.from('customers').insert({
      tenant_id: tenantId,
      name,
      cpf,
      phone: phone || null,
      plan: mapping.plan ? (row[mapping.plan] ?? null) : null,
      status: 'active',
      extra: {
        imported_from: 'sheet',
        original_amount: mapping.amount ? row[mapping.amount] : undefined,
        due_day: mapping.due_day ? row[mapping.due_day] : undefined,
      },
    });

    if (error) {
      result.errors.push({ row: i + 2, reason: error.message });
      continue;
    }
    result.imported++;
  }

  infraLogger.info(
    { tenantId, total: result.totalRows, imported: result.imported, dupes: result.duplicatesSkipped },
    'F6-03: import de planilha concluído',
  );

  return result;
}
