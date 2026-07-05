import { AgentState } from '../agent.state';
import { infraLogger } from '../../../infrastructure/logging/logger';

export async function nodeBlock(state: AgentState): Promise<Partial<AgentState>> {
  infraLogger.warn({
    step: 'block',
    reason: state.guardReason,
    tenantId: state.tenantId,
  }, 'Agent: message blocked by guardrails');

  return {
    response: 'Não foi possível processar sua mensagem. Por favor, entre em contato pelo nosso canal oficial de atendimento.',
    steps: [...state.steps, 'block'],
  };
}
