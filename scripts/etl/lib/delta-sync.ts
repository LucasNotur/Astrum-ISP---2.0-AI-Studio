/**
 * Delta Sync — seleciona registros do Firestore alterados desde a última execução.
 * Plano Mestre V2, S70. Mantém o Supabase espelhado até o cutover (S82).
 *
 * Função pura e testável: dado o watermark anterior e os registros de origem,
 * devolve o que precisa reprocessar. Rodará a cada 15 min via BullMQ.
 */

export interface HasUpdatedAt {
  id: string;
  updatedAt?: string;
}

export interface DeltaResult<T> {
  changed: T[];
  /** novo watermark (maior updatedAt visto) — persistir para a próxima execução */
  nextWatermark: string | null;
}

/**
 * @param records registros de origem
 * @param sinceIso watermark da última execução (null = primeira vez, pega tudo)
 */
export function selectDelta<T extends HasUpdatedAt>(
  records: T[],
  sinceIso: string | null,
): DeltaResult<T> {
  let nextWatermark = sinceIso;
  const changed: T[] = [];

  for (const r of records) {
    const ts = r.updatedAt ?? '';
    if (!sinceIso || ts > sinceIso) changed.push(r);
    if (ts && (!nextWatermark || ts > nextWatermark)) nextWatermark = ts;
  }

  return { changed, nextWatermark };
}
