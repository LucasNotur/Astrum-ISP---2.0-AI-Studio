import { AgentState } from '../agent.state';
import { runGuardrails } from '../../../infrastructure/guardrails/guardrails.pipeline';
import { infraLogger } from '../../../infrastructure/logging/logger';

export async function nodeGuardrails(state: AgentState): Promise<Partial<AgentState>> {
  const result = await runGuardrails(state.userMessage, {
    tenantId: state.tenantId,
  });

  infraLogger.info({
    step: 'guardrails',
    passed: result.safe,
    reason: result.blockedReason,
  }, 'Agent: guardrails');

  return {
    guardPassed: result.safe,
    guardReason: result.blockedReason,
    steps: [...state.steps, 'guardrails'],
  };
}
