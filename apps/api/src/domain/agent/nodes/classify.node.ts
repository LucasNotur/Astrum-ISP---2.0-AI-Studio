import { AgentState } from '../agent.state';
import { IAIPort } from '../../ports/ai.port';
import { ILoggerPort } from '../../ports/logger.port';

export function makeNodeClassify(deps: { ai: Pick<IAIPort, 'classifyIntent'>; logger: ILoggerPort }) {
  return async function nodeClassify(state: AgentState): Promise<Partial<AgentState>> {
    const { userMessage, tenantId, zepContext } = state;

    const { intent, urgency, sentiment } = await deps.ai.classifyIntent(
      userMessage,
      zepContext ?? '',
      tenantId,
    );

    deps.logger.info({ step: 'classify', intent, urgency, tenantId }, 'Agent: classify');

    return {
      intent: intent as AgentState['intent'],
      urgency: urgency as AgentState['urgency'],
      sentiment: sentiment as AgentState['sentiment'],
      steps: [...state.steps, 'classify'],
    };
  };
}
