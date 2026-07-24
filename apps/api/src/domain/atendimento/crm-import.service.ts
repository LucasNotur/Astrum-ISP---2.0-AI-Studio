/**
 * Dossiê #49 — Importação de dados retroativos de CRM terceiros.
 * Importa contatos, conversas e tickets de CRMs externos
 * via CSV/JSON com validação, deduplicação e mapeamento de campos.
 */

export interface ImportField {
  source: string;
  target: string;
  transform?: 'lowercase' | 'uppercase' | 'trim' | 'phone_normalize' | 'date_iso';
}

export interface ImportConfig {
  tenantId: string;
  source: 'csv' | 'json' | 'api';
  entityType: 'contact' | 'conversation' | 'ticket';
  fieldMapping: ImportField[];
  deduplicateBy?: string;
  dryRun: boolean;
}

export interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  duplicates: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

export interface CrmImportPorts {
  upsertContact: (tenantId: string, data: Record<string, string>) => Promise<{ id: string; created: boolean }>;
  upsertConversation: (tenantId: string, data: Record<string, string>) => Promise<{ id: string; created: boolean }>;
  upsertTicket: (tenantId: string, data: Record<string, string>) => Promise<{ id: string; created: boolean }>;
  checkDuplicate: (tenantId: string, entityType: string, key: string, value: string) => Promise<boolean>;
}

export function applyTransform(value: string, transform?: ImportField['transform']): string {
  if (!transform) return value;
  switch (transform) {
    case 'lowercase': return value.toLowerCase();
    case 'uppercase': return value.toUpperCase();
    case 'trim': return value.trim();
    case 'phone_normalize': return value.replace(/\D/g, '');
    case 'date_iso': {
      const parts = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : value;
    }
    default: return value;
  }
}

export function mapRow(row: Record<string, string>, fieldMapping: ImportField[]): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const field of fieldMapping) {
    const raw = row[field.source];
    if (raw !== undefined && raw !== '') {
      mapped[field.target] = applyTransform(raw, field.transform);
    }
  }
  return mapped;
}

export function validateRow(mapped: Record<string, string>, requiredFields: string[]): string[] {
  return requiredFields.filter((f) => !mapped[f] || mapped[f].trim() === '');
}

export async function importBatch(
  rows: Array<Record<string, string>>,
  config: ImportConfig,
  requiredFields: string[],
  ports: CrmImportPorts,
): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, imported: 0, skipped: 0, duplicates: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const mapped = mapRow(rows[i], config.fieldMapping);
    const missing = validateRow(mapped, requiredFields);

    if (missing.length > 0) {
      result.errors.push({ row: i + 1, field: missing[0], message: `Campo obrigatório ausente: ${missing[0]}` });
      result.skipped++;
      continue;
    }

    if (config.deduplicateBy) {
      const dedupValue = mapped[config.deduplicateBy];
      if (dedupValue) {
        const isDuplicate = await ports.checkDuplicate(config.tenantId, config.entityType, config.deduplicateBy, dedupValue);
        if (isDuplicate) {
          result.duplicates++;
          result.skipped++;
          continue;
        }
      }
    }

    if (config.dryRun) {
      result.imported++;
      continue;
    }

    const upsertFn = config.entityType === 'contact' ? ports.upsertContact
      : config.entityType === 'conversation' ? ports.upsertConversation
      : ports.upsertTicket;

    const { created } = await upsertFn(config.tenantId, mapped);
    if (created) result.imported++;
    else result.skipped++;
  }

  return result;
}
