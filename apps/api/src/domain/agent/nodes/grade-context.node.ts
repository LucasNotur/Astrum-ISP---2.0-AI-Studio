import { AgentState } from '../agent.state';
import { ICragPort } from '../../ports/crag.port';
import { isCragEnabled } from '../../ports/crag.port';
import { ILoggerPort } from '../../ports/logger.port';

export function makeNodeGradeContext(deps: { crag: ICragPort; logger: ILoggerPort }) {
  return async function nodeGradeContext(state: AgentState): Promise<Partial<AgentState>> {
    if (!isCragEnabled()) {
      return { steps: [...state.steps, 'grade_context'] };
    }
    if (!state.ragContext && !state.dbContext) {
      return { contextGrade: 'relevant', contextConfidence: 1, steps: [...state.steps, 'grade_context'] };
    }
    try {
      const g = await deps.crag.gradeContext(
        state.userMessage, state.ragContext ?? '', state.dbContext ?? '', state.tenantId,
      );
      deps.logger.info(
        { step: 'grade_context', grade: g.grade, confidence: g.confidence, attempt: state.retrievalAttempts },
        'Agent: CRAG grade',
      );
      return {
        contextGrade: g.grade,
        contextConfidence: g.confidence,
        rewrittenQuery: g.grade !== 'relevant' ? undefined : state.rewrittenQuery,
        steps: [...state.steps, 'grade_context'],
      };
    } catch (err) {
      deps.logger.warn({ err }, 'CRAG grade failed — fail-open');
      return { contextGrade: 'relevant', contextConfidence: 0, steps: [...state.steps, 'grade_context'] };
    }
  };
}