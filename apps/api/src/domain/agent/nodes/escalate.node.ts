import { AgentState } from '../agent.state';
import { supabase } from '../../../infrastructure/database/supabase.client';
import { infraLogger } from '../../../infrastructure/logging/logger';

export async function nodeEscalate(state: AgentState): Promise<Partial<AgentState>> {
  const reason = state.validationIssue ?? state.escalationReason ?? 'Escalação solicitada';

  await supabase.from('tickets').insert({
    tenant_id: state.tenantId,
    customer_id: state.customerId,
    title: `[ESCALAÇÃO IA] ${reason}`,
    description: `Mensagem do cliente: "${state.userMessage}"\n\nRazão: ${reason}`,
    priority: state.urgency === 'high' ? 'urgent' : 'high',
    category: 'technical',
    status: 'open',
    created_by: 'ai_agent',
  });

  infraLogger.warn({
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
}
