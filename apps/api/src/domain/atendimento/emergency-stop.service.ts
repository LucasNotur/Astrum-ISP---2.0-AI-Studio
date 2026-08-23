/**
 * Parada de emergência do atendimento IA — kill switch de verdade.
 *
 * Substitui a promessa quebrada de "rollback = trocar ATENDIMENTO_ENGINE pra legacy"
 * (a Fase 4 apagou o webhook/worker legado por completo — ver migration 108 e a
 * memória `astrum-rollback-atendimento-quebrado`). Fonte única de verdade no
 * Supabase (`atendimento_emergency_stops`), não Redis/env — sobrevive a restart
 * de processo e a flush de cache, e fica com histórico auditável (quem ativou,
 * por quê, quem desativou).
 *
 * Checado em TODA mensagem por `message.worker.ts` antes de chamar LLM/tools/enviar.
 * Ativo → a IA não responde automaticamente, mas a mensagem do cliente ainda é
 * salva na conversa real (não é shadow mode) para um humano assumir.
 */

export interface EmergencyStopRow {
  id: string;
  reason: string;
  activated_at: string;
  activated_by: string;
}

export interface EmergencyStopDeps {
  /** A linha ainda ativa (deactivated_at IS NULL), ou null se não há nenhuma. */
  findActive: () => Promise<EmergencyStopRow | null>;
  insertActivation: (input: { reason: string; activatedBy: string }) => Promise<EmergencyStopRow>;
  deactivate: (input: { id: string; deactivatedBy: string }) => Promise<void>;
}

export interface EmergencyStopStatus {
  active: boolean;
  reason?: string;
  activatedAt?: string;
  activatedBy?: string;
}

export async function getEmergencyStopStatus(deps: EmergencyStopDeps): Promise<EmergencyStopStatus> {
  const row = await deps.findActive();
  if (!row) return { active: false };
  return { active: true, reason: row.reason, activatedAt: row.activated_at, activatedBy: row.activated_by };
}

export async function activateEmergencyStop(
  input: { reason: string; activatedBy: string },
  deps: EmergencyStopDeps,
): Promise<EmergencyStopRow> {
  if (!input.reason?.trim()) {
    throw new Error('Motivo é obrigatório para ativar a parada de emergência.');
  }
  const already = await deps.findActive();
  if (already) {
    throw new Error('Parada de emergência já está ativa.');
  }
  return deps.insertActivation({ reason: input.reason.trim(), activatedBy: input.activatedBy });
}

export async function deactivateEmergencyStop(
  input: { deactivatedBy: string },
  deps: EmergencyStopDeps,
): Promise<void> {
  const active = await deps.findActive();
  if (!active) {
    throw new Error('Nenhuma parada de emergência ativa para desativar.');
  }
  await deps.deactivate({ id: active.id, deactivatedBy: input.deactivatedBy });
}

/**
 * Checagem "hot path" usada pelo worker de mensagens — NUNCA lança. Fail-open
 * documentado: se a checagem em si falhar (Supabase fora do ar), assume NÃO
 * parado. Um apagão do freio de emergência não pode silenciosamente desligar
 * todo o atendimento sem ninguém perceber (o BullMQ já depende do Redis pra
 * sequer entregar o job; se o Supabase também estiver fora, é um incidente
 * maior que precisa de alerta próprio, não de um atendimento mudo por engano).
 */
export async function isEmergencyStopped(deps: Pick<EmergencyStopDeps, 'findActive'>): Promise<boolean> {
  try {
    return Boolean(await deps.findActive());
  } catch {
    return false;
  }
}
