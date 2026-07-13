/**
 * E-03 — AÇÕES EM ALÇADA: o cérebro deixa de sugerir e passa a AGIR.
 *
 * Alçada (RE2 do PLANO_E) — o loop noturno só executa onde o raio de dano é
 * limitado por design:
 *   · kb_scan       → gera RASCUNHOS de KB (humano ainda aprova — dano zero)
 *   · open_incident → abre incidente 'suspeita' (comunicar continua com gate humano)
 *   · bandit_variant / review_prompt → NUNCA executa (gate humano; registra skip)
 *
 * Toda execução passa antes pelo juiz E-04 (eval-gate) quando envolve promoção;
 * kb_scan e open_incident não são promoções (fail-safe por construção), mas o
 * gate é consultado e registrado no diário para auditoria.
 *
 * Flag NIGHTLY_BRAIN_ACT_ENABLED (default OFF): desligada = só sugere (E-01/E-02).
 */
import supabase from '../../../infrastructure/database/supabase.client';
import { iaLogger } from '../../../infrastructure/logging/logger';
import type { SuggestedAction } from './nightly-brain.service';
import { checkEvalGate, type EvalGateStatus } from './eval-gate.service';

export function isNightlyActEnabled(): boolean {
  return (process.env.NIGHTLY_BRAIN_ACT_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export interface ExecutedAction extends SuggestedAction {
  executed: boolean;
  result: string;
}

export interface ActionPorts {
  db: typeof supabase;
  /** Executor real do scan de KB (default: kb-draft.service). Retorna nº de rascunhos gerados. */
  kbScan: (tenantId: string) => Promise<{ generated: number; candidates: number }>;
  /** Executor real do scan de incidentes (default: incident-orchestrator). */
  incidentScan: (tenantId: string) => Promise<{ opened: number; anomalousCtos: string[] }>;
  /** O juiz E-04 (injetável para teste). */
  evalGate: () => EvalGateStatus;
}

async function defaultKbScan(tenantId: string): Promise<{ generated: number; candidates: number }> {
  const { findCandidateConversations, generateDraft } = await import('../../conhecimento/kb-draft.service');
  const candidates = await findCandidateConversations(tenantId);
  let generated = 0;
  for (const c of candidates.slice(0, 20)) { // teto por noite: 20 rascunhos (custo previsível)
    try {
      await generateDraft(tenantId, c.id);
      generated++;
    } catch (err) {
      iaLogger.warn({ err: (err as Error).message, conversationId: c.id }, 'E-03: rascunho falhou');
    }
  }
  return { generated, candidates: candidates.length };
}

async function defaultIncidentScan(tenantId: string): Promise<{ opened: number; anomalousCtos: string[] }> {
  const { scanForIncidents } = await import('../../rede/incident-orchestrator.service');
  return scanForIncidents(tenantId);
}

export const defaultActionPorts: ActionPorts = {
  db: supabase,
  kbScan: defaultKbScan,
  incidentScan: defaultIncidentScan,
  evalGate: checkEvalGate,
};

/**
 * Executa as ações sugeridas pela reflexão DENTRO da alçada e devolve o
 * registro do que aconteceu (vai para ai_reflections.actions — auditável).
 */
export async function executeSuggestedActions(
  tenantId: string,
  actions: SuggestedAction[],
  ports: ActionPorts = defaultActionPorts,
): Promise<ExecutedAction[]> {
  const gate = ports.evalGate();
  const out: ExecutedAction[] = [];

  for (const action of actions) {
    switch (action.type) {
      case 'kb_scan': {
        try {
          const r = await ports.kbScan(tenantId);
          out.push({ ...action, executed: true, result: `${r.generated}/${r.candidates} rascunhos gerados (curadoria humana pendente)` });
        } catch (err) {
          out.push({ ...action, executed: false, result: `falhou: ${(err as Error).message}` });
        }
        break;
      }
      case 'open_incident': {
        try {
          const r = await ports.incidentScan(tenantId);
          out.push({ ...action, executed: true, result: `${r.opened} incidente(s) aberto(s) em ${r.anomalousCtos.length} CTO(s) anômala(s) — comunicar exige gate humano` });
        } catch (err) {
          out.push({ ...action, executed: false, result: `falhou: ${(err as Error).message}` });
        }
        break;
      }
      case 'bandit_variant':
      case 'review_prompt':
      default:
        // Fora de alçada: promoções exigem eval-gate ABERTO **e** humano (E-04/RE2).
        out.push({
          ...action,
          executed: false,
          result: `fora de alçada noturna (gate humano). eval-gate: ${gate.allowed ? 'aberto' : 'fechado'} — ${gate.reason}`,
        });
    }
  }

  iaLogger.info(
    { tenantId, executed: out.filter((a) => a.executed).length, total: out.length },
    'E-03: ações em alçada executadas',
  );
  return out;
}

/** Persiste o resultado da execução por cima das ações da reflexão do dia. */
export async function recordExecutedActions(
  tenantId: string,
  date: string,
  executed: ExecutedAction[],
  db: typeof supabase = supabase,
): Promise<void> {
  const { error } = await db
    .from('ai_reflections')
    .update({ actions: executed })
    .eq('tenant_id', tenantId)
    .eq('reflection_date', date);
  if (error) throw new Error(`E-03: falha ao registrar execução: ${error.message}`);
}
