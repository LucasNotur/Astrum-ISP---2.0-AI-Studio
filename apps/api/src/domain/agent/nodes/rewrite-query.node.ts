import { AgentState } from '../agent.state';
import { ICragPort, isCragEnabled } from '../../ports/crag.port';
import { ILoggerPort } from '../../ports/logger.port';

export function makeNodeRewriteQuery(deps: { crag: ICragPort; logger: ILoggerPort }) {
  return async function nodeRewriteQuery(state: AgentState): Promise<Partial<AgentState>> {
    if (!isCragEnabled()) {
      return { steps: [...state.steps, 'rewrite_query'] };
    }
    let rewritten = state.userMessage;
    try {
      rewritten = await deps.crag.rewriteQuery(
        state.userMessage, 'contexto anterior insuficiente', state.tenantId,
      );
    } catch {
      // fail-open: re-busca com a query original
    }
    deps.logger.info({ step: 'rewrite_query', rewritten: rewritten.slice(0, 80) }, 'Agent: CRAG rewrite');
    return {
      rewrittenQuery: rewritten,
      retrievalAttempts: state.retrievalAttempts + 1,
      steps: [...state.steps, 'rewrite_query'],
    };
  };
}