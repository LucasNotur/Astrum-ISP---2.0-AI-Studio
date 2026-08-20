/**
 * PLANO I — agregação de materiais do dia. Soma os itens de todas as OS ativas
 * do técnico numa lista única (nome + unidade), pra ele carregar da base e não
 * voltar por falta de material. Pura (sem I/O) → testável.
 */
export interface MaterialRow { name: string; quantity: number | string | null; unit?: string | null }
export interface AggregatedMaterial { name: string; quantity: number; unit: string }

/** Agrupa por (nome + unidade), soma a quantidade e ordena por nome. */
export function aggregateMaterials(rows: MaterialRow[]): AggregatedMaterial[] {
  const byKey = new Map<string, AggregatedMaterial>();
  for (const r of rows) {
    if (!r?.name) continue;
    const unit = r.unit ?? '';
    const key = `${r.name}__${unit}`;
    const qty = Number(r.quantity) || 0;
    const prev = byKey.get(key);
    if (prev) prev.quantity += qty;
    else byKey.set(key, { name: r.name, unit, quantity: qty });
  }
  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}
