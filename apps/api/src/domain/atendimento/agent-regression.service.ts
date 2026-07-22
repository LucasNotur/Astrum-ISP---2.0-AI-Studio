/**
 * Dossiê #75 — Regresso automático IA-Agent.
 * Quando o agente IA não resolve em N turnos ou o cliente expressa
 * insatisfação, escala automaticamente para operador humano.
 */

export interface ConversationState {
  conversationId: string;
  tenantId: string;
  turnCount: number;
  sentimentScores: number[];
  lastClassification: 'resolved' | 'unresolved' | 'escalated' | 'active';
  hasLoop: boolean;
}

export interface RegressionConfig {
  maxTurnsBeforeEscalation: number;
  sentimentThreshold: number;
  loopDetectionWindow: number;
  loopRepeatThreshold: number;
}

export const DEFAULT_REGRESSION_CONFIG: RegressionConfig = {
  maxTurnsBeforeEscalation: 5,
  sentimentThreshold: -0.3,
  loopDetectionWindow: 4,
  loopRepeatThreshold: 0.8,
};

export type RegressionDecision = 'continue' | 'escalate_turns' | 'escalate_sentiment' | 'escalate_loop';

export function detectLoop(intents: string[], window: number, threshold: number): boolean {
  if (intents.length < window) return false;
  const recent = intents.slice(-window);
  const counts = new Map<string, number>();
  for (const i of recent) counts.set(i, (counts.get(i) ?? 0) + 1);
  const maxRepeat = Math.max(...counts.values());
  return maxRepeat / window >= threshold;
}

export function evaluateRegression(
  state: ConversationState,
  intents: string[],
  cfg: RegressionConfig = DEFAULT_REGRESSION_CONFIG,
): RegressionDecision {
  if (state.lastClassification === 'escalated' || state.lastClassification === 'resolved') {
    return 'continue';
  }

  if (state.turnCount >= cfg.maxTurnsBeforeEscalation) {
    return 'escalate_turns';
  }

  const avgSentiment = state.sentimentScores.length > 0
    ? state.sentimentScores.reduce((a, b) => a + b, 0) / state.sentimentScores.length
    : 0;

  if (avgSentiment <= cfg.sentimentThreshold) {
    return 'escalate_sentiment';
  }

  if (detectLoop(intents, cfg.loopDetectionWindow, cfg.loopRepeatThreshold)) {
    return 'escalate_loop';
  }

  return 'continue';
}

export interface RegressionPorts {
  escalateToHuman: (tenantId: string, conversationId: string, reason: string) => Promise<void>;
  logRegression: (tenantId: string, conversationId: string, decision: RegressionDecision) => Promise<void>;
}

export async function handleRegression(
  state: ConversationState,
  intents: string[],
  ports: RegressionPorts,
  cfg?: RegressionConfig,
): Promise<RegressionDecision> {
  const decision = evaluateRegression(state, intents, cfg);

  if (decision !== 'continue') {
    const reasons: Record<string, string> = {
      escalate_turns: `Máximo de ${cfg?.maxTurnsBeforeEscalation ?? DEFAULT_REGRESSION_CONFIG.maxTurnsBeforeEscalation} turnos atingido`,
      escalate_sentiment: 'Sentimento negativo detectado',
      escalate_loop: 'Loop de intenções detectado',
    };
    await ports.escalateToHuman(state.tenantId, state.conversationId, reasons[decision]);
  }

  await ports.logRegression(state.tenantId, state.conversationId, decision);
  return decision;
}
