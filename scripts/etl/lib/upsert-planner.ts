/**
 * Upsert Planner — decide INSERT vs UPDATE por `legacy_id`, garantindo idempotência.
 *
 * Plano Mestre V2, S69: "reexecutar o ETL não pode duplicar". Esta lógica é pura e
 * testável: dado o conjunto de registros de origem e os legacy_ids já presentes no
 * alvo, produz o plano de escrita sem tocar em I/O.
 */

export interface PlannedRow {
  legacyId: string;
  row: Record<string, unknown>;
}

export interface UpsertPlan {
  toInsert: PlannedRow[];
  toUpdate: PlannedRow[];
}

/**
 * @param sourceRows linhas já transformadas (cada uma deve conter `legacy_id`)
 * @param existingLegacyIds legacy_ids que já existem no alvo (de um SELECT prévio)
 */
export function planUpsert(
  sourceRows: Record<string, unknown>[],
  existingLegacyIds: Set<string>,
): UpsertPlan {
  const toInsert: PlannedRow[] = [];
  const toUpdate: PlannedRow[] = [];
  const seen = new Set<string>();

  for (const row of sourceRows) {
    const legacyId = row.legacy_id as string;
    if (!legacyId) throw new Error('Linha sem legacy_id — não é idempotável');
    // Dedup dentro do próprio lote de origem (Firestore pode ter duplicata).
    if (seen.has(legacyId)) continue;
    seen.add(legacyId);

    if (existingLegacyIds.has(legacyId)) toUpdate.push({ legacyId, row });
    else toInsert.push({ legacyId, row });
  }

  return { toInsert, toUpdate };
}

/** Contagem esperada pós-execução: total distinto de legacy_ids (origem ∪ alvo). */
export function expectedRowCount(
  sourceLegacyIds: string[],
  existingLegacyIds: Set<string>,
): number {
  const union = new Set(existingLegacyIds);
  for (const id of sourceLegacyIds) union.add(id);
  return union.size;
}
