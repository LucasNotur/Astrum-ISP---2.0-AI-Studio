import { AgentState } from '../agent.state';
import { classifyResponseSafety, isSafetyClassifierEnabled, SafetyCategory } from '../../../infrastructure/guardrails/safety-classifier.service';
import { IDatabasePort } from '../../ports/database.port';
import { ILoggerPort } from '../../ports/logger.port';

export function makeNodeSafetyVeto(deps: {
  db: IDatabasePort;
  logger: ILoggerPort;
}) {
  return async function nodeSafetyVeto(state: AgentState): Promise<Partial<AgentState>> {
    // Padrão IA-01: flag off = short-circuit sem chamar LLM.
    if (!isSafetyClassifierEnabled()) {
      return { steps: [...state.steps, 'safety_veto'] };
    }

    const response = state.response ?? '';
    if (!response) {
      return { steps: [...state.steps, 'safety_veto'] };
    }

    const context = [state.ragContext, state.dbContext].filter(Boolean).join('\n\n');
    const verdict = await classifyResponseSafety(response, context, state.tenantId);

    if (verdict.safe) {
      deps.logger.info(
        { step: 'safety_veto', safe: true, tenantId: state.tenantId },
        'Agent: safety veto passed',
      );
      return { steps: [...state.steps, 'safety_veto'] };
    }

    // !safe → grava fila de revisão (fire-and-forget) e marca veto no state.
    const categories: SafetyCategory[] = verdict.categories;
    deps.db.recordSafetyVeto({
      tenant_id: state.tenantId,
      conversation_id: state.conversationId,
      response_text: response,
      categories,
    }).catch((err) => {
      deps.logger.warn(
        { err: (err as Error).message, tenantId: state.tenantId },
        'safety_veto: falha ao gravar fila de revisão',
      );
    });

    deps.logger.warn(
      { step: 'safety_veto', categories, tenantId: state.tenantId },
      'Agent: response VETADA pelo classificador de segurança',
    );

    return {
      safetyVetoed: true,
      safetyCategories: categories,
      steps: [...state.steps, 'safety_veto'],
    };
  };
}
