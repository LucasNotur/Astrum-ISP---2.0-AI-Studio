/**
 * Dossiê #40 — Integração Bidirecional Astrum <-> ERP (completude).
 * Item #40 estava parcial (write-back para suspend/OS existe).
 * Agora com sync genérico bidirecional, conflict resolution e changelog.
 */

export type SyncDirection = 'astrum_to_erp' | 'erp_to_astrum';
export type ConflictStrategy = 'astrum_wins' | 'erp_wins' | 'newest_wins' | 'manual';

export interface SyncField {
  astrumField: string;
  erpField: string;
  direction: SyncDirection | 'bidirectional';
  transform?: (value: unknown) => unknown;
}

export interface SyncConfig {
  tenantId: string;
  erpType: string;
  entityType: string;
  fields: SyncField[];
  conflictStrategy: ConflictStrategy;
  syncIntervalMinutes: number;
  isEnabled: boolean;
}

export interface SyncConflict {
  field: string;
  astrumValue: unknown;
  erpValue: unknown;
  astrumUpdatedAt: string;
  erpUpdatedAt: string;
}

export interface SyncResult {
  synced: number;
  conflicts: SyncConflict[];
  errors: Array<{ entityId: string; message: string }>;
}

export interface BiSyncPorts {
  getConfig: (tenantId: string, erpType: string) => Promise<SyncConfig | null>;
  fetchErpEntities: (tenantId: string, entityType: string, since: string) => Promise<Array<{ id: string; data: Record<string, unknown>; updatedAt: string }>>;
  fetchAstrumEntities: (tenantId: string, entityType: string, since: string) => Promise<Array<{ id: string; data: Record<string, unknown>; updatedAt: string }>>;
  writeToErp: (tenantId: string, entityId: string, data: Record<string, unknown>) => Promise<void>;
  writeToAstrum: (tenantId: string, entityId: string, data: Record<string, unknown>) => Promise<void>;
  logSync: (tenantId: string, result: SyncResult) => Promise<void>;
}

export function detectConflicts(
  astrumData: Record<string, unknown>,
  erpData: Record<string, unknown>,
  fields: SyncField[],
  astrumUpdatedAt: string,
  erpUpdatedAt: string,
): SyncConflict[] {
  const conflicts: SyncConflict[] = [];
  for (const field of fields) {
    if (field.direction !== 'bidirectional') continue;
    const aVal = astrumData[field.astrumField];
    const eVal = erpData[field.erpField];
    if (aVal !== undefined && eVal !== undefined && String(aVal) !== String(eVal)) {
      conflicts.push({
        field: field.astrumField,
        astrumValue: aVal,
        erpValue: eVal,
        astrumUpdatedAt,
        erpUpdatedAt,
      });
    }
  }
  return conflicts;
}

export function resolveConflict(conflict: SyncConflict, strategy: ConflictStrategy): { winner: 'astrum' | 'erp' | 'manual'; value: unknown } {
  switch (strategy) {
    case 'astrum_wins': return { winner: 'astrum', value: conflict.astrumValue };
    case 'erp_wins': return { winner: 'erp', value: conflict.erpValue };
    case 'newest_wins':
      return conflict.astrumUpdatedAt >= conflict.erpUpdatedAt
        ? { winner: 'astrum', value: conflict.astrumValue }
        : { winner: 'erp', value: conflict.erpValue };
    case 'manual': return { winner: 'manual', value: undefined };
  }
}

export function mapFields(
  source: Record<string, unknown>,
  fields: SyncField[],
  direction: SyncDirection,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.direction !== 'bidirectional' && field.direction !== direction) continue;
    const sourceKey = direction === 'astrum_to_erp' ? field.astrumField : field.erpField;
    const targetKey = direction === 'astrum_to_erp' ? field.erpField : field.astrumField;
    const value = source[sourceKey];
    if (value !== undefined) {
      mapped[targetKey] = field.transform ? field.transform(value) : value;
    }
  }
  return mapped;
}
