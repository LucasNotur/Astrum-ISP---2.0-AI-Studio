import { StateGraph, END, START } from '@langchain/langgraph';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { MultiAgentState, AgentDomain } from './multi-agent.state';
import { MultiAgentStateSchema, initialMultiAgentState } from './multi-agent.state';
import { runCobrancaSubgraph, type CobrancaSubgraphDeps } from './subgraphs/cobranca.subgraph';
import { runRetencaoSubgraph, type RetencaoSubgraphDeps } from './subgraphs/retencao.subgraph';
import { runVendasSubgraph, type VendasSubgraphDeps } from './subgraphs/vendas.subgraph';
import { LangGraphService } from './langgraph.service';
import { computeChurnScore, type ChurnFeatures } from '../ml/churn-score';
import { extractFeatures } from '../ml/churn-features.service';
import { infraLogger } from '../../infrastructure/logging/logger';
import type { ILoggerPort } from '../ports/logger.port';
import { isMultiAgentEnabled } from '../../infrastructure/config/engine-flags';

/**
 * IA-10 — Multi-agente por domínio.
 *
 * Supervisor LangGraph que roteia a conversa para subgrafos especializados:
 * - atendimento: grafo atual (suporte técnico/billing generalista).
 * - cobranca: tools de fatura/negociação com política do CobrAI.
 * - retencao: gatilhado por churn crítico (IA-07).
 *
 * Handoff via edge condicional por intent/domain. Estado compartilhado mínimo.
 */

const miniModel = openai('gpt-4o-mini');

const SupervisorIntentSchema = z.object({
  domain: z.enum(['atendimento', 'cobranca', 'retencao', 'vendas', 'escalation']),
  reason: z.string().max(300),
});

export interface MultiAgentDeps extends CobrancaSubgraphDeps, RetencaoSubgraphDeps, VendasSubgraphDeps {
  langGraphService?: LangGraphService;
  classifyDomainFn?: (message: string, tenantId: string) => Promise<{ domain: AgentDomain; reason: string }>;
  checkChurnFn?: (tenantId: string, customerId: string) => Promise<{ riskBand: string } | null>;
  logger?: ILoggerPort;
}

export async function classifyDomain(
  message: string,
  tenantId: string,
): Promise<{ domain: AgentDomain; reason: string }> {
  const { object } = await generateObject({
    model: miniModel as any,
    schema: SupervisorIntentSchema,
    system: `Você é o supervisor de atendimento da Astrum. Classifique a intenção do cliente em uma das categorias:
- atendimento: suporte técnico, status, visita, diagnóstico
- cobranca: fatura, boleto, negociação, suspensão
- retencao: cancelamento, insatisfação, churn crítico
- vendas: quero contratar, novo plano, instalar internet, viabilidade, preços, planos disponíveis
- escalation: caso complexo que precisa de humano
Responda apenas com o JSON solicitado.`,
    messages: [{ role: 'user', content: message }],
    headers: {
      'Helicone-Property-TenantId': tenantId,
      'Helicone-Property-UseCase': 'multi-agent-supervisor',
    },
  });
  return object;
}

export async function checkChurnCritical(
  tenantId: string,
  customerId: string,
): Promise<boolean> {
  try {
    const features = await extractFeatures(tenantId, customerId);
    const { riskBand } = computeChurnScore(features);
    return riskBand === 'critical';
  } catch (err) {
    infraLogger.warn({ err, tenantId, customerId }, 'checkChurnCritical falhou — fail-open');
    return false;
  }
}

export function buildMultiAgentGraph(deps: MultiAgentDeps = {}) {
  const logger = deps.logger ?? infraLogger;
  const langGraph = deps.langGraphService ?? new LangGraphService(logger);
  const classify = deps.classifyDomainFn ?? classifyDomain;
  const checkChurn = deps.checkChurnFn ?? checkChurnCritical;

  const graph = new StateGraph<MultiAgentState>({
    channels: {
      tenantId: { value: (x, y) => y ?? x },
      customerId: { value: (x, y) => y ?? x },
      conversationId: { value: (x, y) => y ?? x },
      userMessage: { value: (x, y) => y ?? x },
      domain: { value: (x, y) => y ?? x },
      domainReason: { value: (x, y) => y ?? x },
      summary: { value: (x, y) => y ?? x },
      subGraphResult: { value: (x, y) => y ?? x },
      response: { value: (x, y) => y ?? x },
      requiresHuman: { value: (x, y) => y ?? x },
      steps: { value: (x, y) => y ?? x, default: () => [] },
      startedAt: { value: (x, y) => y ?? x, default: () => new Date().toISOString() },
      tokensUsed: { value: (x, y) => y ?? x, default: () => 0 },
      error: { value: (x, y) => y ?? x },
    },
  });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const nodeSupervisor = async (state: MultiAgentState) => {
    // Se flag off, bypassa supervisor e delega ao atendimento.
    if (!isMultiAgentEnabled()) {
      return { domain: 'atendimento' as AgentDomain, domainReason: 'multi_agent_disabled', steps: [...state.steps, 'supervisor_bypass'] };
    }

    const classification = await classify(state.userMessage, state.tenantId);
    let domain = classification.domain;
    let reason = classification.reason;

    // Churn crítico sempre vence a classificação.
    const isCritical = await checkChurn(state.tenantId, state.customerId);
    if (isCritical) {
      domain = 'retencao';
      reason = `${reason} | churn critico detectado`;
    }

    logger.info({ domain, reason, tenantId: state.tenantId }, 'Multi-agent supervisor routed');
    return { domain, domainReason: reason, steps: [...state.steps, 'supervisor'] };
  };

  const nodeAtendimento = async (state: MultiAgentState) => {
    const out = await langGraph.processMessage({
      tenantId: state.tenantId,
      customerId: state.customerId,
      conversationId: state.conversationId,
      userMessage: state.userMessage,
    });
    return {
      response: out.response,
      requiresHuman: out.requiresHuman,
      steps: [...state.steps, 'atendimento_subgraph'],
    };
  };

  const nodeCobranca = async (state: MultiAgentState) => runCobrancaSubgraph(state, deps);
  const nodeRetencao = async (state: MultiAgentState) => runRetencaoSubgraph(state, deps);
  const nodeVendas = async (state: MultiAgentState) => runVendasSubgraph(state, deps);

  const nodeEscalation = async (state: MultiAgentState) => ({
    response: 'Vou transferir você para um atendente humano para melhor atendê-lo.',
    requiresHuman: true,
    steps: [...state.steps, 'escalation'],
  });

  graph.addNode('supervisor', nodeSupervisor as any);
  graph.addNode('atendimento', nodeAtendimento as any);
  graph.addNode('cobranca', nodeCobranca as any);
  graph.addNode('retencao', nodeRetencao as any);
  graph.addNode('vendas', nodeVendas as any);
  graph.addNode('escalation', nodeEscalation as any);

  graph.addEdge(START, 'supervisor' as any);
  graph.addConditionalEdges('supervisor' as any, (state: MultiAgentState) => {
    return state.domain ?? 'atendimento';
  });
  graph.addEdge('atendimento' as any, END);
  graph.addEdge('cobranca' as any, END);
  graph.addEdge('retencao' as any, END);
  graph.addEdge('vendas' as any, END);
  graph.addEdge('escalation' as any, END);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return graph.compile();
}

export class MultiAgentService {
  private readonly graph;

  constructor(private readonly deps: MultiAgentDeps = {}) {
    this.graph = buildMultiAgentGraph(deps);
  }

  async processMessage(input: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    userMessage: string;
  }): Promise<{
    response: string;
    domain?: AgentDomain;
    requiresHuman: boolean;
    steps: string[];
  }> {
    const state = initialMultiAgentState(input);
    const logger = this.deps.logger ?? infraLogger;

    try {
      const finalState = await this.graph.invoke(state) as MultiAgentState;
      return {
        response: finalState.response ?? 'Não foi possível gerar uma resposta.',
        domain: finalState.domain,
        requiresHuman: finalState.requiresHuman ?? false,
        steps: finalState.steps ?? [],
      };
    } catch (err) {
      logger.error({ err, tenantId: input.tenantId }, 'Multi-agent: fatal error');
      return {
        response: 'Desculpe, ocorreu um erro interno. Um atendente será acionado.',
        requiresHuman: true,
        steps: state.steps,
      };
    }
  }
}

export const multiAgentService = new MultiAgentService();
