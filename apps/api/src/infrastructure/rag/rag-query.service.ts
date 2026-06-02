import { generateEmbedding } from '../../adapters/ai/embedding.service';
import { searchSimilar, type SearchResult } from '../../adapters/vector/qdrant.adapter';
import { callLLM } from '../../adapters/ai/llm.adapter';
import { iaLogger } from '../logging/logger';
import { supabaseAdmin } from '../database/supabase.client';
import { traceRAGPipeline } from '../observability/langsmith.service';

/**
 * RAG Query Engine — Retrieval Augmented Generation.
 *
 * FLUXO:
 * 1. Gerar embedding da query do usuário
 * 2. Buscar chunks relevantes no Qdrant (por similaridade semântica)
 * 3. Montar contexto com os chunks encontrados
 * 4. Chamar LLM com contexto + query
 * 5. Retornar resposta fundamentada nos documentos do ISP
 *
 * SEM RAG: LLM responde com conhecimento geral (pode alucinar detalhes técnicos)
 * COM RAG: LLM responde com base nos manuais reais do ISP (preciso e confiável)
 */

export interface RAGQueryOptions {
  query: string;
  tenantId: string;
  userId?: string;
  conversationId?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxContextChunks?: number;
  scoreThreshold?: number;
  fallbackToGeneral?: boolean; // usar LLM sem contexto se RAG não encontrar nada
}

export interface RAGQueryResult {
  answer: string;
  sourcesUsed: Array<{ filename: string; chunkIndex: number; score: number }>;
  ragUsed: boolean;
  chunksFound: number;
  tokensUsed: number;
  latencyMs: number;
}

/**
 * Monta o system prompt com contexto RAG para o LLM.
 */
function buildRAGSystemPrompt(
  chunks: SearchResult[],
  tenantName: string
): string {
  const contextBlocks = chunks
    .map((chunk, i) =>
      `[Fonte ${i + 1} — ${chunk.filename}]\n${chunk.chunkText}`
    )
    .join('\n\n---\n\n');

  return `Você é o assistente técnico do provedor de internet ${tenantName}.

Responda à pergunta do cliente APENAS com base nas informações abaixo.
Se a resposta não estiver nas fontes, diga claramente que não encontrou a informação e sugira contato com o suporte.
Nunca invente informações técnicas.

=== BASE DE CONHECIMENTO ===
${contextBlocks}
=== FIM DA BASE DE CONHECIMENTO ===

Responda em português, de forma clara e objetiva.
Se for uma questão técnica, inclua os passos numerados.`;
}

/**
 * System prompt para quando RAG não encontra contexto relevante.
 */
const FALLBACK_SYSTEM_PROMPT = `Você é um assistente de atendimento de provedor de internet.
Ajude o cliente com suas dúvidas de forma educada e profissional.
Para questões técnicas específicas, sempre recomende contato com o suporte técnico.
Responda em português.`;

export async function queryRAG(options: RAGQueryOptions): Promise<RAGQueryResult> {
  const start = Date.now();
  const {
    query,
    tenantId,
    userId,
    conversationHistory = [],
    maxContextChunks = 5,
    scoreThreshold = 0.7,
    fallbackToGeneral = true,
  } = options;

  iaLogger.info({ tenantId, queryPreview: query.slice(0, 80) }, 'RAG query iniciada');

  // Buscar nome do tenant para o system prompt
  const { data: aiConfig } = await supabaseAdmin
    .from('ai_configurations')
    .select('bot_name, custom_instructions, temperature')
    .eq('tenant_id', tenantId)
    .single();

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .single();

  const tenantName = tenant?.name ?? 'nosso provedor';

  // 1. Gerar embedding da query
  const queryEmbedding = await generateEmbedding(query, tenantId);

  // 2. Buscar chunks relevantes no Qdrant
  let chunks: SearchResult[] = [];
  try {
    chunks = await searchSimilar(tenantId, queryEmbedding, {
      limit: maxContextChunks,
      scoreThreshold,
    });
  } catch (err) {
    iaLogger.warn({ err, tenantId }, 'Qdrant indisponível — usando LLM sem contexto RAG');
  }

  const ragUsed = chunks.length > 0;

  iaLogger.info(
    { tenantId, chunksFound: chunks.length, ragUsed },
    ragUsed ? 'RAG: chunks relevantes encontrados' : 'RAG: sem chunks relevantes — usando fallback'
  );

  // 3. Montar system prompt
  const systemPrompt = ragUsed
    ? buildRAGSystemPrompt(chunks, tenantName)
    : FALLBACK_SYSTEM_PROMPT;

  // 4. Montar messages com histórico da conversa
  const messages = [
    ...conversationHistory,
    { role: 'user' as const, content: query },
  ];

  // 5. Chamar LLM
  const llmResponse = await callLLM({
    messages,
    systemPrompt,
    tenantId,
    userId,
    context: ragUsed ? 'support' : 'support',
    forceModel: ragUsed ? 'gpt-4o' : 'gpt-4o-mini',
    temperature: aiConfig?.temperature ?? 0.7,
  });

  const result: RAGQueryResult = {
    answer: llmResponse.content,
    sourcesUsed: chunks.map(c => ({
      filename: c.filename,
      chunkIndex: c.chunkIndex,
      score: Math.round(c.score * 100) / 100,
    })),
    ragUsed,
    chunksFound: chunks.length,
    tokensUsed: llmResponse.tokensUsed,
    latencyMs: Date.now() - start,
  };

  iaLogger.info(
    {
      tenantId,
      ragUsed,
      chunksFound: chunks.length,
      tokensUsed: llmResponse.tokensUsed,
      latencyMs: result.latencyMs,
    },
    'RAG query concluída'
  );

  const langsmithRunId = await traceRAGPipeline({
    query: options.query,
    chunksRetrieved: chunks.map(c => ({
      filename: c.filename,
      score: c.score,
      text: c.chunkText.slice(0, 200), // apenas preview — não enviar conteúdo completo
    })),
    answer: result.answer,
    metadata: {
      tenantId: options.tenantId,
      conversationId: options.conversationId,
      userId: options.userId,
      model: llmResponse.routingDecision,
      ragUsed,
      chunksFound: chunks.length,
    },
  });

  // Salvar runId no banco para permitir feedback posterior
  if (langsmithRunId && options.conversationId) {
    await supabaseAdmin
      .from('messages')
      .update({ metadata: { langsmith_run_id: langsmithRunId } })
      .eq('conversation_id', options.conversationId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1);
  }

  return result;
}
