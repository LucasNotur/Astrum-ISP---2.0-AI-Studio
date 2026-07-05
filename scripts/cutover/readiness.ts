/**
 * Cutover Readiness — decide se o corte final (S82: remover Express/Firestore) pode
 * acontecer. Puro e testável. O corte só é liberado quando NADA em produção depende
 * mais do legado. Rodado como gate antes da remoção de código.
 */

export interface CutoverSignals {
  /** todos os tenants estão com atendimento em v2 (S74 concluído para 100%) */
  allTenantsAtendimentoV2: boolean;
  /** CobrAI unificado em v2 e estável 48h (S76) */
  cobraiV2Stable: boolean;
  /** GATE DE DADOS aprovado e delta-sync sem divergência (S70) */
  dataGatePassed: boolean;
  /** auth migrado; nenhum uso de firebase/auth no frontend (S77) */
  authMigrated: boolean;
  /** frontend lê Supabase; firestore client desligado (S78) */
  frontendOnSupabase: boolean;
  /** workers operacionais portados e legados desligados (S79–S81) */
  workersPorted: boolean;
  /** backup completo do Firestore no R2 verificado */
  firestoreBackupVerified: boolean;
}

export interface CutoverDecision {
  ready: boolean;
  blockers: string[];
}

const CHECKS: { key: keyof CutoverSignals; blocker: string }[] = [
  { key: 'allTenantsAtendimentoV2', blocker: 'Há tenants ainda em atendimento legacy (S74 incompleto)' },
  { key: 'cobraiV2Stable', blocker: 'CobrAI v2 não estável 48h (S76)' },
  { key: 'dataGatePassed', blocker: 'GATE DE DADOS não aprovado (S70)' },
  { key: 'authMigrated', blocker: 'Auth ainda usa Firebase (S77)' },
  { key: 'frontendOnSupabase', blocker: 'Frontend ainda lê Firestore (S78)' },
  { key: 'workersPorted', blocker: 'Workers legados ainda ativos (S79–S81)' },
  { key: 'firestoreBackupVerified', blocker: 'Backup do Firestore no R2 não verificado' },
];

export function evaluateCutoverReadiness(signals: Partial<CutoverSignals>): CutoverDecision {
  const blockers = CHECKS.filter((c) => signals[c.key] !== true).map((c) => c.blocker);
  return { ready: blockers.length === 0, blockers };
}
