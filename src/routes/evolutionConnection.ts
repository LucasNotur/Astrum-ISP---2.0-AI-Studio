/**
 * OBS-11 (auditoria 2026-08-10): idempotência do evento `connection.update` do Evolution.
 *
 * O Evolution reenvia `connection.update` com o MESMO estado (`open`) repetidamente
 * (heartbeats/replay). O handler antigo gravava `whatsappStatus` E anexava um NOVO log
 * a CADA evento → a coleção `logs` crescia sem limite com entradas duplicadas.
 *
 * Aqui a persistência só acontece quando o estado MUDA de fato. Deps injetadas para
 * testar sem acoplar ao db-compat/rota.
 */
export interface ConnectionUpdateDeps {
  getPrevStatus: () => Promise<string | undefined>;
  setStatus: (state: string) => Promise<void>;
  appendLog: (state: string) => Promise<void>;
}

export async function handleConnectionUpdate(
  deps: ConnectionUpdateDeps,
  newState: string | undefined | null,
): Promise<{ changed: boolean }> {
  if (!newState) return { changed: false };

  const prev = await deps.getPrevStatus();
  if (prev === newState) return { changed: false }; // replay/heartbeat — no-op

  await deps.setStatus(newState);
  await deps.appendLog(newState);
  return { changed: true };
}
