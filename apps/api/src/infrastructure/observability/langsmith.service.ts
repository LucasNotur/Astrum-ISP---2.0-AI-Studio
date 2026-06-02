import { Client as LangSmithClient } from 'langsmith';
import { iaLogger } from '../logging/logger';

/**
 * LangSmith Tracing — rastreamento de todas as chamadas LLM.
 *
 * DADOS RASTREADOS POR CHAMADA:
 * - Input (messages + system prompt)
 * - Output (resposta gerada)
 * - Metadados: tenantId, conversationId, modelo, tokens, latência
 * - RAG: chunks usados como contexto
 * - Feedback do operador (se marcado como bom/ruim)
 *
 * IMPORTANTE: Nunca enviar PII para o LangSmith.
 * O texto já chegou mascarado pelo PII Detector.
 */

let client: LangSmithClient | null = null;

const isEnabled = !!process.env.LANGCHAIN_API_KEY;

function getLangSmithClient(): LangSmithClient | null {
  if (!isEnabled) return null;
  if (client) return client;

  client = new LangSmithClient({
    apiKey: process.env.LANGCHAIN_API_KEY,
    apiUrl: 'https://api.smith.langchain.com',
  });

  return client;
}

export interface LLMRunMetadata {
  tenantId: string;
  conversationId?: string;
  userId?: string;
  model: string;
  ragUsed: boolean;
  chunksFound?: number;
  guardrailsLatencyMs?: number;
}

export interface LLMRunInput {
  messages: Array<{ role: string; content: string }>;
  systemPrompt?: string;
}

export interface LLMRunOutput {
  content: string;
  tokensUsed: number;
  latencyMs: number;
}

/**
 * Registra uma execução LLM no LangSmith para rastreamento.
 * Retorna o runId para permitir feedback posterior.
 */
export async function traceLLMRun(
  input: LLMRunInput,
  output: LLMRunOutput,
  metadata: LLMRunMetadata
): Promise<string | null> {
  const ls = getLangSmithClient();
  if (!ls) return null;

  try {
    const runId = crypto.randomUUID();

    await ls.createRun({
      id: runId,
      name: `astrum:llm:${metadata.model}`,
      run_type: 'llm',
      inputs: {
        messages: input.messages,
        system: input.systemPrompt,
      },
      outputs: {
        content: output.content,
      },
      extra: {
        metadata: {
          tenant_id: metadata.tenantId,
          conversation_id: metadata.conversationId,
          user_id: metadata.userId,
          rag_used: metadata.ragUsed,
          chunks_found: metadata.chunksFound,
          guardrails_latency_ms: metadata.guardrailsLatencyMs,
        },
      },
      start_time: Date.now() - output.latencyMs,
      end_time: Date.now(),
    });

    // Atualizar com tokens usados
    await ls.updateRun(runId, {
      extra: {
        usage: {
          total_tokens: output.tokensUsed,
        },
      },
    });

    return runId;
  } catch (err) {
    // LangSmith falha → nunca quebrar o atendimento
    iaLogger.warn({ err }, 'LangSmith: falha ao registrar run (ignorando)');
    return null;
  }
}

/**
 * Registra feedback do operador sobre a qualidade de uma resposta.
 * score: 1 = boa resposta | 0 = resposta ruim
 */
export async function recordFeedback(
  runId: string,
  score: 0 | 1,
  comment?: string
): Promise<void> {
  const ls = getLangSmithClient();
  if (!ls || !runId) return;

  try {
    await ls.createFeedback(runId, 'operator_rating', {
      score,
      comment: comment ?? (score === 1 ? 'Resposta aprovada' : 'Resposta rejeitada'),
    });

    iaLogger.info({ runId, score }, 'LangSmith: feedback registrado');
  } catch (err) {
    iaLogger.warn({ err, runId }, 'LangSmith: falha ao registrar feedback');
  }
}

/**
 * Trace especializado para o pipeline RAG completo.
 */
export async function traceRAGPipeline(opts: {
  query: string;
  chunksRetrieved: Array<{ filename: string; score: number; text: string }>;
  answer: string;
  metadata: LLMRunMetadata;
}): Promise<string | null> {
  const ls = getLangSmithClient();
  if (!ls) return null;

  try {
    const runId = crypto.randomUUID();

    await ls.createRun({
      id: runId,
      name: 'astrum:rag:pipeline',
      run_type: 'chain',
      inputs: { query: opts.query },
      outputs: {
        answer: opts.answer,
        sources: opts.chunksRetrieved.map(c => ({
          filename: c.filename,
          relevance_score: c.score,
        })),
      },
      extra: {
        metadata: {
          tenant_id: opts.metadata.tenantId,
          conversation_id: opts.metadata.conversationId,
          chunks_retrieved: opts.chunksRetrieved.length,
          rag_used: opts.metadata.ragUsed,
        },
      },
      start_time: Date.now() - 1000,
      end_time: Date.now(),
    });

    return runId;
  } catch (err) {
    iaLogger.warn({ err }, 'LangSmith: falha ao registrar RAG pipeline');
    return null;
  }
}

export function isLangSmithEnabled(): boolean {
  return isEnabled;
}
