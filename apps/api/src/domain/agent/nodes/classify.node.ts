import { AgentState } from '../agent.state';
import { IAIPort } from '../../ports/ai.port';
import { ILoggerPort } from '../../ports/logger.port';
import { detectLanguage, isLiveTranslationEnabled } from '../../../infrastructure/ai/language-detector';

export function makeNodeClassify(deps: { ai: Pick<IAIPort, 'classifyIntent'>; logger: ILoggerPort }) {
  return async function nodeClassify(state: AgentState): Promise<Partial<AgentState>> {
    const { userMessage, tenantId, zepContext } = state;

    const { intent, urgency, sentiment } = await deps.ai.classifyIntent(
      userMessage,
      zepContext ?? '',
      tenantId,
    );

    // IA-14: detecção de idioma só rola com flag on (curto-circuito sem custo).
    const detectedLanguage = isLiveTranslationEnabled()
      ? detectLanguage(userMessage)
      : undefined;

    deps.logger.info({
      step: 'classify',
      intent,
      urgency,
      tenantId,
      ...(detectedLanguage ? { language: detectedLanguage } : {}),
    }, 'Agent: classify');

    return {
      intent: intent as AgentState['intent'],
      urgency: urgency as AgentState['urgency'],
      sentiment: sentiment as AgentState['sentiment'],
      detectedLanguage,
      steps: [...state.steps, 'classify'],
    };
  };
}
