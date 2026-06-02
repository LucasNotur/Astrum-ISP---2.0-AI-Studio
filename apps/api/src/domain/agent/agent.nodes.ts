import { AgentState } from './agent.state';
import { vercelAIService } from '../../infrastructure/ai/vercel-ai.service';
import { guardrailsService } from '../../infrastructure/ai/guardrails.service';
import { hybridSearchService } from '../../infrastructure/rag/hybrid-search.service';
import { memoryComposerService } from '../../infrastructure/memory/memory-composer.service';
import { ToolsExecutor } from '../../infrastructure/ai/tools.executor';
import { supabase } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

/**
 * Nós do Grafo LangGraph
 *
 * FLUXO DO AGENTE:
 *
 * [START]
 *   ↓
 * [classify] → classifica intent + urgência + sentimento
 *   ↓
 * [guardrails] → PII, injection, moderation
 *   ↓ (se passou)
 * [decide_source] → Agentic RAG: decide Qdrant vs Supabase vs ambos
 *   ↓
 * [fetch_context] → busca dados nas fontes decididas em paralelo
 *   ↓
 * [generate] → gera resposta com tools + stream
 *   ↓
 * [validate] → verifica qualidade da resposta
 *   ↓ (se passou)
 * [send] → persiste e envia para o usuário
 *   ↓
 * [END]
 *
 *   ↓ (guardrail bloqueou)
 * [block] → resposta de bloqueio padronizada
 *
 *   ↓ (validate falhou OU requires_human)
 * [escalate] → cria ticket + notifica operador humano
 */

// ─── Nó 1: Classify ──────────────────────────────────────────────────────────

export async function nodeClassify(state: AgentState): Promise<Partial<AgentState>> {
  const intent = await vercelAIService.classifyIntent(
    state.userMessage,
    '', // histórico vem do Zep na etapa de contexto
    state.tenantId,
  );

  infraLogger.info({
    step: 'classify',
    intent: intent.intent,
    urgency: intent.urgency,
    tenantId: state.tenantId,
  }, 'Agent: classify');

  return {
    intent: intent.intent,
    urgency: intent.urgency,
    sentiment: intent.sentiment,
    steps: [...state.steps, 'classify'],
  };
}

// ─── Nó 2: Guardrails ────────────────────────────────────────────────────────

export async function nodeGuardrails(state: AgentState): Promise<Partial<AgentState>> {
  const result = await guardrailsService.check({
    message: state.userMessage,
    tenantId: state.tenantId,
    customerId: state.customerId,
  });

  infraLogger.info({
    step: 'guardrails',
    passed: result.passed,
    reason: result.reason,
  }, 'Agent: guardrails');

  return {
    guardPassed: result.passed,
    guardReason: result.reason,
    steps: [...state.steps, 'guardrails'],
  };
}

// ─── Nó 3: Decide Source (AGENTIC RAG) ───────────────────────────────────────

export async function nodeDecideSource(state: AgentState): Promise<Partial<AgentState>> {
  /**
   * AGENTIC RAG — O agente decide autonomamente qual fonte usar:
   *
   * QDRANT: perguntas técnicas, configurações, manuais
   *   → "Como configuro PPPoE?", "Meu roteador tem luz vermelha"
   *
   * SUPABASE: dados transacionais do cliente
   *   → "Quanto devo?", "Meu plano vence quando?", "Qual meu status?"
   *
   * BOTH: perguntas que misturam técnico + dados
   *   → "Por que minha velocidade está baixa se paguei em dia?"
   *
   * NONE: perguntas simples de conversa
   *   → "Obrigado", "Até mais", "Bom dia"
   */

  const { intent, userMessage } = state;

  // Regras determinísticas (rápidas, sem custo de API)
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

  infraLogger.info({
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
}

// ─── Nó 4: Fetch Context ─────────────────────────────────────────────────────

export async function nodeFetchContext(state: AgentState): Promise<Partial<AgentState>> {
  const { dataSource, userMessage, tenantId, customerId } = state;

  let ragContext = '';
  let dbContext = '';

  // Buscar em paralelo nas fontes necessárias
  const promises: Promise<void>[] = [];

  if (dataSource === 'qdrant' || dataSource === 'both') {
    promises.push(
      hybridSearchService.search(userMessage, tenantId, { limit: 4, hydeSensitivity: 'auto' })
        .then(results => {
          ragContext = results.map((r: any, i: number) =>
            `[Doc ${i+1}] ${r.filename} (score: ${r.score.toFixed(2)}):\n${r.content}`
          ).join('\n\n');
        })
        .catch(() => { ragContext = ''; })
    );
  }

  if (dataSource === 'supabase' || dataSource === 'both') {
    promises.push(
      fetchCustomerData(customerId, tenantId)
        .then(data => { dbContext = data; })
        .catch(() => { dbContext = ''; })
    );
  }

  await Promise.allSettled(promises);

  infraLogger.info({
    step: 'fetch_context',
    hasRAG: Boolean(ragContext),
    hasDB: Boolean(dbContext),
    ragChars: ragContext.length,
  }, 'Agent: fetch_context');

  return {
    ragContext,
    dbContext,
    steps: [...state.steps, 'fetch_context'],
  };
}

async function fetchCustomerData(customerId: string, tenantId: string): Promise<string> {
  const { data: customer } = await supabase
    .from('customers')
    .select(`
      name, plan, status, monthly_value_cents,
      invoices(id, amount_cents, status, due_date),
      tickets(id, title, status, created_at)
    `)
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .single();

  if (!customer) return '';

  const overdueInvoices = (customer.invoices as any[])?.filter(i => i.status === 'overdue') ?? [];
  const openTickets = (customer.tickets as any[])?.filter(t => t.status === 'open') ?? [];

  return `Cliente: ${customer.name}
Plano: ${customer.plan} (R$${(customer.monthly_value_cents / 100).toFixed(2)}/mês)
Status: ${customer.status}
Faturas em atraso: ${overdueInvoices.length} (total: R$${overdueInvoices.reduce((s: number, i: any) => s + i.amount_cents, 0) / 100})
Tickets abertos: ${openTickets.length}`;
}

// ─── Nó 5: Generate ──────────────────────────────────────────────────────────

export async function nodeGenerate(state: AgentState): Promise<Partial<AgentState>> {
  const { ragContext, dbContext, zepContext, userMessage, tenantId, customerId } = state;

  const systemContext = [
    ragContext && `## Documentos Técnicos:\n${ragContext}`,
    dbContext && `## Dados do Cliente:\n${dbContext}`,
    zepContext && `## Histórico:\n${zepContext}`,
  ].filter(Boolean).join('\n\n---\n\n');

  const toolsExecutor = new ToolsExecutor(tenantId);
  const toolsExecuted: AgentState['toolsExecuted'] = [];

  const streamResult = await vercelAIService.streamWithTools(
    [{ role: 'user', content: userMessage }],
    systemContext,
    tenantId,
    async (toolName, args) => {
      const result = await toolsExecutor.execute(toolName, args as Record<string, unknown>);
      toolsExecuted!.push({ name: toolName, args: args as Record<string, unknown>, result });
      return result;
    },
  );

  // Coletar texto completo do stream
  let fullResponse = '';
  for await (const chunk of streamResult.textStream) {
    fullResponse += chunk;
  }

  infraLogger.info({
    step: 'generate',
    responseLength: fullResponse.length,
    toolsUsed: toolsExecuted.length,
  }, 'Agent: generate');

  return {
    response: fullResponse,
    toolsExecuted,
    steps: [...state.steps, 'generate'],
  };
}

// ─── Nó 6: Validate ──────────────────────────────────────────────────────────

export async function nodeValidate(state: AgentState): Promise<Partial<AgentState>> {
  const { response, intent, userMessage } = state;

  if (!response) {
    return {
      validationPassed: false,
      validationIssue: 'Resposta vazia gerada',
      steps: [...state.steps, 'validate'],
    };
  }

  // Validações determinísticas (sem custo de API)
  const isEmpty = response.trim().length < 10;
  const hasHallucination = /eu não tenho acesso|como IA da OpenAI|como modelo de linguagem/i.test(response);
  const isOffTopic = response.length > 50 &&
    !/(internet|conexão|sinal|plano|fatura|boleto|suporte|técnico|roteador|fibra|cancelar|pagar)/i.test(response) &&
    ['support_technical', 'support_billing'].includes(intent ?? '');

  const validationPassed = !isEmpty && !hasHallucination && !isOffTopic;

  infraLogger.info({
    step: 'validate',
    validationPassed,
    isEmpty,
    hasHallucination,
    isOffTopic,
  }, 'Agent: validate');

  return {
    validationPassed,
    validationIssue: isEmpty ? 'Resposta vazia'
      : hasHallucination ? 'Alucinação detectada'
      : isOffTopic ? 'Resposta fora do contexto ISP'
      : undefined,
    steps: [...state.steps, 'validate'],
  };
}

// ─── Nó 7: Escalate ──────────────────────────────────────────────────────────

export async function nodeEscalate(state: AgentState): Promise<Partial<AgentState>> {
  const reason = state.validationIssue ?? state.escalationReason ?? 'Escalação solicitada';

  // Criar ticket de escalação
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

// ─── Nó 8: Block ─────────────────────────────────────────────────────────────

export async function nodeBlock(state: AgentState): Promise<Partial<AgentState>> {
  infraLogger.warn({
    step: 'block',
    reason: state.guardReason,
    tenantId: state.tenantId,
  }, 'Agent: message blocked by guardrails');

  return {
    response: 'Não foi possível processar sua mensagem. Por favor, entre em contato pelo nosso canal oficial de atendimento.',
    steps: [...state.steps, 'block'],
  };
}
