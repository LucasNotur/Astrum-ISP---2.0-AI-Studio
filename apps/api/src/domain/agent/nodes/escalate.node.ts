import { AgentState } from '../agent.state';
import { IDatabasePort } from '../../ports/database.port';
import { ILoggerPort } from '../../ports/logger.port';
import { buildHandoverSummary, formatHandoverForTicket } from '../../atendimento/handover-summary.service';

export function makeNodeEscalate(deps: { db: IDatabasePort; logger: ILoggerPort }) {
  return async function nodeEscalate(state: AgentState): Promise<Partial<AgentState>> {
    const reason = state.validationIssue ?? state.escalationReason ?? 'Escalação solicitada';
    const handover = buildHandoverSummary(state);

    await deps.db.createTicket({
      tenant_id: state.tenantId,
      customer_id: state.customerId,
      title: `[ESCALAÇÃO IA] ${reason}`,
      description: formatHandoverForTicket(handover),
      priority: state.urgency === 'high' ? 'urgent' : 'high',
      source: 'ai_agent',
      conversation_id: state.conversationId,
    });

    deps.logger.warn({
      step: 'escalate',
      reason,
      tenantId: state.tenantId,
      customerId: state.customerId,
    }, 'Agent: escalating to human');

    return {
      response: `Entendo sua situação. Vou transferir seu atendimento para um de nossos especialistas que poderá ajudá-lo melhor. Um ticket foi criado e você será atendido em breve.`,
      requiresHuman: true,
      escalationReason: reason,
      steps: [...state.steps, 'escalate'],
    };
  };
}
