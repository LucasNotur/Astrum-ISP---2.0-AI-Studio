import { AgentState } from '../agent.state';
import { ILoggerPort } from '../../ports/logger.port';

/**
 * AGENTIC RAG — O agente decide autonomamente qual fonte usar:
 *
 * QDRANT: perguntas técnicas, configurações, manuais
 * SUPABASE: dados transacionais do cliente
 * BOTH: perguntas que misturam técnico + dados
 * NONE: perguntas simples de conversa
 */
export function makeNodeDecideSource(logger: ILoggerPort) {
  return async function nodeDecideSource(state: AgentState): Promise<Partial<AgentState>> {
    const { intent, userMessage } = state;

    const isTechnical = ['support_technical'].includes(intent ?? '');
    const isBilling = ['support_billing', 'check_status', 'upgrade_plan', 'cancel_service'].includes(intent ?? '');
    const isConversational = ['other'].includes(intent ?? '') &&
      /^(olá|oi|bom dia|boa tarde|boa noite|obrigad|tudo bem|até|tchau)/i.test(userMessage);

    let dataSource: AgentState['dataSource'];
    let sourceReason: string;

    if (isConversational) {
      dataSource = 'none';
      sourceReason = 'Mensagem conversacional — sem necessidade de dados externos';
    } else if (isTechnical && isBilling) {
      dataSource = 'both';
      sourceReason = 'Questão mista: requer manuais técnicos + dados do cliente';
    } else if (isTechnical) {
      dataSource = 'qdrant';
      sourceReason = 'Questão técnica: buscar manuais e documentação no Qdrant';
    } else if (isBilling) {
      dataSource = 'supabase';
      sourceReason = 'Questão de conta: buscar dados transacionais no Supabase';
    } else {
      dataSource = 'both';
      sourceReason = 'Intent ambígua — buscar em ambas as fontes';
    }

    logger.info({
      step: 'decide_source',
      dataSource,
      intent,
      sourceReason,
    }, 'Agent: decide_source (Agentic RAG)');

    return {
      dataSource,
      sourceReason,
      steps: [...state.steps, 'decide_source'],
    };
  };
}
