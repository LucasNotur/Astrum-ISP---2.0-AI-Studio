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
  nodeGradeContext,
  nodeRewriteQuery,
  nodeSelfCheck,
  nodeSafetyVeto,
} from './agent.nodes';
import type { ILoggerPort } from '../ports/logger.port';
import { infraLogger } from '../../infrastructure/logging/logger';
import { isCragEnabled } from '../ports/crag.port';
import { aiAuditService } from '../../infrastructure/audit/ai-audit.service';

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
      // CRAG — IA-01 (campo novo SEM channel = patch descartado silenciosamente)
      contextGrade: { value: (x, y) => y ?? x },
      contextConfidence: { value: (x, y) => y ?? x },
      retrievalAttempts: { value: (x, y) => y ?? x, default: () => 0 },
      rewrittenQuery: { value: (x, y) => y ?? x },
      selfCheckPassed: { value: (x, y) => y ?? x },
      selfCheckIssues: { value: (x, y) => y ?? x },
      regenerationAttempts: { value: (x, y) => y ?? x, default: () => 0 },
      toolsExecuted: { value: (x, y) => y ?? x, default: () => [] },
      response: { value: (x, y) => y ?? x },
      streamTokens: { value: (x, y) => y ?? x },
      validationPassed: { value: (x, y) => y ?? x },
      validationIssue: { value: (x, y) => y ?? x },
      // IA-21 — Safety veto
      safetyVetoed: { value: (x, y) => y ?? x },
      safetyCategories: { value: (x, y) => y ?? x },
      // IA-14 — Idioma detectado pelo classificador
      detectedLanguage: { value: (x, y) => y ?? x },
      requiresHuman: { value: (x, y) => y ?? x },
      escalationReason: { value: (x, y) => y ?? x },
      steps: { value: (x, y) => y ?? x, default: () => [] },
      startedAt: { value: (x, y) => y ?? x, default: () => new Date().toISOString() },
      tokensUsed: { value: (x, y) => y ?? x, default: () => 0 },
      error: { value: (x, y) => y ?? x },
    },
  });

  /* eslint-disable @typescript-eslint/no-explicit-any -- LangGraph SDK exige node names como string genérica; tipos incompatíveis por design da lib */
  // ─── Adicionar nós ───────────────────────────────────────────────────────
  graph.addNode('classify', nodeClassify as any);
  graph.addNode('guardrails', nodeGuardrails as any);
  graph.addNode('decide_source', nodeDecideSource as any);
  graph.addNode('fetch_context', nodeFetchContext as any);
  graph.addNode('generate', nodeGenerate as any);
  graph.addNode('validate', nodeValidate as any);
  graph.addNode('escalate', nodeEscalate as any);
  graph.addNode('block', nodeBlock as any);
  // CRAG — IA-01
  graph.addNode('grade_context', nodeGradeContext as any);
  graph.addNode('rewrite_query', nodeRewriteQuery as any);
  graph.addNode('self_check', nodeSelfCheck as any);
  // IA-21 — Constitutional classifier
  graph.addNode('safety_veto', nodeSafetyVeto as any);

  // ─── Edges lineares ──────────────────────────────────────────────────────
  graph.addEdge(START, 'classify' as any);
  graph.addEdge('classify' as any, 'guardrails' as any);
  graph.addEdge('decide_source' as any, 'fetch_context' as any);
  // CRAG: fetch_context → grade_context (em vez de → generate direto)
  graph.addEdge('fetch_context' as any, 'grade_context' as any);
  // CRAG: rewrite rebate de volta em fetch_context (loop corretivo máx 1×)
  graph.addEdge('rewrite_query' as any, 'fetch_context' as any);
  // CRAG: generate → self_check (em vez de → validate direto)
  graph.addEdge('generate' as any, 'self_check' as any);
  graph.addEdge('escalate' as any, END);
  graph.addEdge('block' as any, END);

  // ─── Edges condicionais ──────────────────────────────────────────────────
  graph.addConditionalEdges('guardrails' as any, (state: AgentState) => {
    if (!state.guardPassed) return 'block';
    return 'decide_source';
  });

  // CRAG — IA-01: roteia conforme a qualidade do contexto recuperado.
  // Flag lida DENTRO do edge (não no import do singleton) p/ não congelar no boot.
  graph.addConditionalEdges('grade_context' as any, (state: AgentState) => {
    if (!isCragEnabled()) return 'generate';
    if (state.contextGrade === 'relevant') return 'generate';
    if (state.retrievalAttempts >= 1) return 'generate'; // máx 1 loop corretivo
    return 'rewrite_query';
  });

  // CRAG — IA-01: resposta não-fundamentada NUNCA vai pro cliente — vira escalação.
  // Flag off → straight to validate (comportamento atual preservado).
  graph.addConditionalEdges('self_check' as any, (state: AgentState) => {
    if (!isCragEnabled()) return 'validate';
    if (state.selfCheckPassed) return 'validate';
    return 'escalate';
  });

  graph.addConditionalEdges('validate' as any, (state: AgentState) => {
    if (!state.validationPassed || state.requiresHuman) return 'escalate';
    // IA-21: validate passou → passa pelo safety_veto antes de encerrar.
    return 'safety_veto';
  });

  // IA-21 — Veto do classificador de segurança. Flag off = no-op (categoria vazia, sem veto).
  // Sem canal de "flag" no edge (consistente com IA-01): o próprio nó faz short-circuit.
  graph.addConditionalEdges('safety_veto' as any, (state: AgentState) => {
    if (state.safetyVetoed) return 'escalate';
    return END;
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

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

      // IA-06 — Audit trail (fire-and-forget, fail-open)
      const decisionType = finalState.requiresHuman
        ? 'escalation'
        : (finalState.steps ?? []).includes('block')
          ? 'block'
          : 'agent_response';
      aiAuditService.recordDecision({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        customerId: input.customerId,
        decisionType,
        payload: {
          userMessage: input.userMessage,
          steps: finalState.steps ?? [],
          intent: finalState.intent,
          dataSource: finalState.dataSource,
          toolsExecuted: finalState.toolsExecuted?.map(t => t.name) ?? [],
          validated: finalState.validationPassed,
          requiresHuman: finalState.requiresHuman ?? false,
          tokensUsed: finalState.tokensUsed ?? 0,
        },
      }).catch(() => { /* fire-and-forget */ });

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
