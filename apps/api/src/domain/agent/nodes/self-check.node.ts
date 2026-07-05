import { AgentState } from '../agent.state';
import { ICragPort, isCragEnabled } from '../../ports/crag.port';
import { ILoggerPort } from '../../ports/logger.port';

export function makeNodeSelfCheck(deps: { crag: ICragPort; logger: ILoggerPort }) {
  return async function nodeSelfCheck(state: AgentState): Promise<Partial<AgentState>> {
    if (!isCragEnabled()) {
      return { steps: [...state.steps, 'self_check'] };
    }
    if (!state.response) {
      return { selfCheckPassed: false, steps: [...state.steps, 'self_check'] };
    }
    try {
      const check = await deps.crag.selfCheck(
        state.response, state.ragContext ?? '', state.dbContext ?? '', state.tenantId,
      );
      deps.logger.info(
        { step: 'self_check', grounded: check.grounded, issues: check.unsupported_claims.length },
        'Agent: CRAG self-check',
      );
      return {
        selfCheckPassed: check.grounded,
        selfCheckIssues: check.unsupported_claims,
        steps: [...state.steps, 'self_check'],
      };
    } catch (err) {
      deps.logger.warn({ err }, 'CRAG self-check failed — fail-open');
      return { selfCheckPassed: true, steps: [...state.steps, 'self_check'] };
    }
  };
}