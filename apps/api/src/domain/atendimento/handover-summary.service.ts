/**
 * P1-04 — Resumo estruturado para transferência humana.
 * Paridade WitHub: operador recebe contexto rico ao assumir o atendimento.
 */
import type { AgentState } from '../agent/agent.state';

export interface HandoverSummary {
  customerId: string | null;
  issue: string;
  lastMessage: string;
  stepsCompleted: string[];
  urgency: 'low' | 'normal' | 'high';
  suggestedNextStep: string;
  contextSnippet: string;
}

export function buildHandoverSummary(state: AgentState): HandoverSummary {
  const issue =
    state.escalationReason ?? state.validationIssue ?? 'Sem classificação automática';

  const urgency: HandoverSummary['urgency'] =
    state.urgency === 'high' ? 'high' : state.urgency === 'normal' ? 'normal' : 'low';

  const contextLines = [
    `Última mensagem: "${state.userMessage}"`,
    `Intenção detectada: ${state.intent ?? 'não classificada'}`,
    `Sentimento: ${state.sentiment ?? 'desconhecido'}`,
    `Passos executados: ${state.steps.join(' → ') || 'nenhum'}`,
    `Motivo da escalação: ${issue}`,
  ];

  if (state.toolsExecuted?.length) {
    contextLines.push(
      `Tools usadas: ${state.toolsExecuted.map(t => t.name).join(', ')}`,
    );
  }

  return {
    customerId: state.customerId ?? null,
    issue,
    lastMessage: state.userMessage,
    stepsCompleted: state.steps,
    urgency,
    suggestedNextStep: deriveSuggestedStep(issue, state.intent, state.steps),
    contextSnippet: contextLines.join('\n'),
  };
}

export function formatHandoverForTicket(summary: HandoverSummary): string {
  return [
    `## Resumo da IA para o Operador`,
    ``,
    `**Problema:** ${summary.issue}`,
    `**Urgência:** ${summary.urgency}`,
    `**Próximo passo sugerido:** ${summary.suggestedNextStep}`,
    ``,
    `### Contexto`,
    summary.contextSnippet,
  ].join('\n');
}

function deriveSuggestedStep(
  issue: string,
  intent: AgentState['intent'],
  steps: string[],
): string {
  if (intent === 'support_billing' || /pagament|fatur|cobran/i.test(issue)) {
    return 'Verificar situação financeira do cliente e oferecer negociação manual';
  }
  if (intent === 'support_technical' || /técnic|sinal|lentidão|instab/i.test(issue)) {
    return 'Abrir OS técnica e verificar histórico de ocorrências na região';
  }
  if (intent === 'cancel_service' || /cancel/i.test(issue)) {
    return 'Acionar equipe de retenção com oferta de upgrade ou desconto';
  }
  if (steps.includes('guardrails') || steps.includes('block')) {
    return 'Revisar conversa — conteúdo sensível detectado pelos guardrails';
  }
  return 'Verificar histórico do cliente e dar continuidade ao atendimento';
}
