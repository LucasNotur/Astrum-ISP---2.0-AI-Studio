import { AgentState } from '../agent.state';
import { vercelAIService } from '../../../infrastructure/ai/vercel-ai.service';
import { infraLogger } from '../../../infrastructure/logging/logger';

export async function nodeClassify(state: AgentState): Promise<Partial<AgentState>> {
  const intent = await vercelAIService.classifyIntent(
    state.userMessage,
    '', // histórico vem do Zep na etapa de contexto
    state.tenantId,
  );

  infraLogger.info({
    step: 'classify',
    intent: intent.intent,
    urgency: intent.urgency,
    tenantId: state.tenantId,
  }, 'Agent: classify');

  return {
    intent: intent.intent,
    urgency: intent.urgency,
    sentiment: intent.sentiment,
    steps: [...state.steps, 'classify'],
  };
}
