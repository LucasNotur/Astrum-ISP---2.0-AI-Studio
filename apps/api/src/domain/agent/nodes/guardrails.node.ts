import { AgentState } from '../agent.state';
import { IGuardrailsPort } from '../../ports/guardrails.port';
import { ILoggerPort } from '../../ports/logger.port';

export function makeNodeGuardrails(deps: { guardrails: IGuardrailsPort; logger: ILoggerPort }) {
  return async function nodeGuardrails(state: AgentState): Promise<Partial<AgentState>> {
    const result = await deps.guardrails.run(state.userMessage, { tenantId: state.tenantId });

    deps.logger.info({
      step: 'guardrails',
      passed: result.safe,
      reason: result.blockedReason,
    }, 'Agent: guardrails');

    return {
      guardPassed: result.safe,
      guardReason: result.blockedReason,
      steps: [...state.steps, 'guardrails'],
    };
  };
}
