import type { SupabaseClient } from '@supabase/supabase-js';
import { AgentState } from '../agent.state';
import { IAIPort } from '../../ports/ai.port';
import { ILoggerPort } from '../../ports/logger.port';
import { detectLanguage, isLiveTranslationEnabled } from '../../../infrastructure/ai/language-detector';

export function makeNodeClassify(deps: {
  ai: Pick<IAIPort, 'classifyIntent'>;
  logger: ILoggerPort;
  db: SupabaseClient;
}) {
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

    // IA-33 — fire-and-forget de contagem para o drift detector. Só escreve
    // quando a flag DRIFT_DETECTION_ENABLED=true. NUNCA await, NUNCA propaga
    // erro: se o upsert falhar, logger.warn e o nó segue.
    const driftEnabled =
      (process.env.DRIFT_DETECTION_ENABLED ?? '').trim().toLowerCase() === 'true';
    if (driftEnabled && intent) {
      const day = new Date().toISOString().slice(0, 10);
      Promise.resolve(
        deps.db
          .from('ai_intent_daily')
          .upsert(
            {
              tenant_id: tenantId,
              day,
              intent,
              sentiment: sentiment ?? null,
              count: 1,
            },
            { onConflict: 'tenant_id,day,intent,sentiment' },
          ),
      )
        .then()
        .catch((e: unknown) => deps.logger.warn({ err: e, tenantId, intent }, 'drift-upsert-failed'));
    }

    return {
      intent: intent as AgentState['intent'],
      urgency: urgency as AgentState['urgency'],
      sentiment: sentiment as AgentState['sentiment'],
      detectedLanguage,
      steps: [...state.steps, 'classify'],
    };
  };
}
