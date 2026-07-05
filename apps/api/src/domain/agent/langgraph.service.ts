import { StateGraph, END, START } from '@langchain/langgraph';
import { AgentState, AgentStateSchema, initialState } from './agent.state';
import {
  nodeClassify,
  nodeGuardrails,
  nodeDecideSource,
  nodeFetchContext,
  nodeGenerate,
  nodeValidate,
  nodeEscalate,
  nodeBlock,
} from './agent.nodes';
import type { ILoggerPort } from '../ports/logger.port';
import { infraLogger } from '../../infrastructure/logging/logger';

/**
 * LangGraph Agent Service
 *
 * BLOCO 4 — Orquestração de Agentes (State Machine)
 *
 * O grafo garante DETERMINISMO: a IA só pode avançar se cada nó
 * validar as condições de saída. Impossível pular guardrails ou
 * executar ações financeiras sem confirmação.
 *
 * EDGES CONDICIONAIS:
 * - guardrails → [block | decide_source]
 * - validate → [escalate | END]
 */

function buildAgentGraph() {
  const graph = new StateGraph<AgentState>({
    channels: {
      tenantId: { value: (x, y) => y ?? x },
      customerId: { value: (x, y) => y ?? x },
      conversationId: { value: (x, y) => y ?? x },
      userMessage: { value: (x, y) => y ?? x },
      intent: { value: (x, y) => y ?? x },
      urgency: { value: (x, y) => y ?? x },
      sentiment: { value: (x, y) => y ?? x },
      guardPassed: { value: (x, y) => y ?? x },
      guardReason: { value: (x, y) => y ?? x },
      dataSource: { value: (x, y) => y ?? x },
      sourceReason: { value: (x, y) => y ?? x },
      ragContext: { value: (x, y) => y ?? x },
      dbContext: { value: (x, y) => y ?? x },
      zepContext: { value: (x, y) => y ?? x },
      toolsExecuted: { value: (x, y) => y ?? x, default: () => [] },
      response: { value: (x, y) => y ?? x },
      streamTokens: { value: (x, y) => y ?? x },
      validationPassed: { value: (x, y) => y ?? x },
      validationIssue: { value: (x, y) => y ?? x },
      requiresHuman: { value: (x, y) => y ?? x },
      escalationReason: { value: (x, y) => y ?? x },
      steps: { value: (x, y) => y ?? x, default: () => [] },
      startedAt: { value: (x, y) => y ?? x, default: () => new Date().toISOString() },
      tokensUsed: { value: (x, y) => y ?? x, default: () => 0 },
      error: { value: (x, y) => y ?? x },
    },
  });

  // ─── Adicionar nós ────────────────────────────────────────────────────────
  graph.addNode('classify', nodeClassify as any);
  graph.addNode('guardrails', nodeGuardrails as any);
  graph.addNode('decide_source', nodeDecideSource as any);
  graph.addNode('fetch_context', nodeFetchContext as any);
  graph.addNode('generate', nodeGenerate as any);
  graph.addNode('validate', nodeValidate as any);
  graph.addNode('escalate', nodeEscalate as any);
  graph.addNode('block', nodeBlock as any);

  // ─── Edges lineares ───────────────────────────────────────────────────────
  graph.addEdge(START, 'classify' as any);
  graph.addEdge('classify' as any, 'guardrails' as any);
  graph.addEdge('decide_source' as any, 'fetch_context' as any);
  graph.addEdge('fetch_context' as any, 'generate' as any);
  graph.addEdge('generate' as any, 'validate' as any);
  // escalate e block terminam a state machine
  graph.addEdge('escalate' as any, END);
  graph.addEdge('block' as any, END);

  // ─── Edges condicionais ───────────────────────────────────────────────────

  // Após guardrails: bloquear OU continuar
  graph.addConditionalEdges('guardrails' as any, (state: AgentState) => {
    if (!state.guardPassed) return 'block';
    return 'decide_source';
  });

  // Após validate: escalar OU finalizar
  graph.addConditionalEdges('validate' as any, (state: AgentState) => {
    if (!state.validationPassed || state.requiresHuman) return 'escalate';
    return END;
  });

  return graph.compile();
}

// Singleton do grafo compilado
const agentGraph = buildAgentGraph();

// ─── Service ─────────────────────────────────────────────────────────────────

export class LangGraphService {
  constructor(private readonly logger: ILoggerPort = infraLogger) {}

  /**
   * Processa uma mensagem pelo grafo de agente completo.
   * Retorna a resposta final após todos os nós.
   */
  async processMessage(input: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    userMessage: string;
  }): Promise<{
    response: string;
    steps: string[];
    requiresHuman: boolean;
    toolsExecuted: AgentState['toolsExecuted'];
    tokensUsed: number;
  }> {
    const state = initialState(input);

    this.logger.info({
      tenantId: input.tenantId,
      messageLength: input.userMessage.length,
    }, 'LangGraph: processing message');

    try {
      const finalState = await agentGraph.invoke(state) as AgentState;

      this.logger.info({
        steps: finalState.steps,
        requiresHuman: finalState.requiresHuman,
        toolsUsed: finalState.toolsExecuted?.length ?? 0,
        dataSource: finalState.dataSource,
      }, 'LangGraph: complete');

      return {
        response: finalState.response ?? 'Não foi possível gerar uma resposta.',
        steps: finalState.steps ?? [],
        requiresHuman: finalState.requiresHuman ?? false,
        toolsExecuted: finalState.toolsExecuted ?? [],
        tokensUsed: finalState.tokensUsed ?? 0,
      };

    } catch (err) {
      this.logger.error({ err, tenantId: input.tenantId }, 'LangGraph: fatal error');
      return {
        response: 'Desculpe, ocorreu um erro interno. Um ticket foi aberto para nosso time.',
        steps: state.steps,
        requiresHuman: true,
        toolsExecuted: [],
        tokensUsed: 0,
      };
    }
  }
}

export const langGraphService = new LangGraphService();
