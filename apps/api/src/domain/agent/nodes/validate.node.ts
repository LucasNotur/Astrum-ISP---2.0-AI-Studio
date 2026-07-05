import { AgentState } from '../agent.state';
import { infraLogger } from '../../../infrastructure/logging/logger';

export async function nodeValidate(state: AgentState): Promise<Partial<AgentState>> {
  const { response, intent } = state;

  if (!response) {
    return {
      validationPassed: false,
      validationIssue: 'Resposta vazia gerada',
      steps: [...state.steps, 'validate'],
    };
  }

  const isEmpty = response.trim().length < 10;
  const hasHallucination = /eu não tenho acesso|como IA da OpenAI|como modelo de linguagem/i.test(response);
  const isOffTopic = response.length > 50 &&
    !/(internet|conexão|sinal|plano|fatura|boleto|suporte|técnico|roteador|fibra|cancelar|pagar)/i.test(response) &&
    ['support_technical', 'support_billing'].includes(intent ?? '');

  const validationPassed = !isEmpty && !hasHallucination && !isOffTopic;

  infraLogger.info({
    step: 'validate',
    validationPassed,
    isEmpty,
    hasHallucination,
    isOffTopic,
  }, 'Agent: validate');

  return {
    validationPassed,
    validationIssue: isEmpty ? 'Resposta vazia'
      : hasHallucination ? 'Alucinação detectada'
      : isOffTopic ? 'Resposta fora do contexto ISP'
      : undefined,
    steps: [...state.steps, 'validate'],
  };
}
