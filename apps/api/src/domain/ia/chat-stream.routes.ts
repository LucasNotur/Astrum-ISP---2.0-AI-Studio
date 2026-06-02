import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { runGuardrails } from '../../infrastructure/guardrails/guardrails.pipeline';
import { buildSystemPrompt } from '../../infrastructure/rag/system-prompt-builder.service';
import { generateEmbedding } from '../../adapters/ai/embedding.service';
import { searchSimilar } from '../../adapters/vector/qdrant.adapter';
import { vercelAIService } from '../../infrastructure/ai/vercel-ai.service';
import { ToolsExecutor } from '../../infrastructure/ai/tools.executor';
import { z } from 'zod';
import { validateBody } from '../../infrastructure/validation/zod-validator';

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
});

export async function chatStreamRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v2/chat/stream
   * Envia mensagem e recebe resposta em streaming (Server-Sent Events).
   * O frontend recebe tokens à medida que são gerados — efeito "digitando".
   */
  fastify.post('/api/v2/chat/stream', {
    onRequest: [fastify.authenticate],
    preHandler: [
      requirePermission('tickets', 'read'),
      validateBody(chatSchema),
    ],
  }, async (request, reply) => {
    const { tenantId, userId } = (request as any).user;
    const { message, conversationId, customerId } = (request as any).validatedBody;

    // 1. Guardrails
    const guardrails = await runGuardrails(message, { tenantId });
    if (!guardrails.safe) {
      return reply.status(400).send({
        code: 'CONTENT_BLOCKED',
        message: 'Não posso processar esta mensagem.',
      });
    }

    // 2. RAG — buscar contexto relevante
    let ragContext = '';
    try {
      const queryEmbedding = await generateEmbedding(guardrails.processedText, tenantId);
      const chunks = await searchSimilar(tenantId, queryEmbedding, {
        limit: 4,
        scoreThreshold: 0.72,
      });
      if (chunks.length > 0) {
        ragContext = chunks
          .map((c, i) => `[Fonte ${i + 1} — ${c.filename}]\n${c.chunkText}`)
          .join('\n\n---\n\n');
      }
    } catch { /* Qdrant indisponível — continuar sem RAG */ }

    // 3. Classificar intent ANTES do streaming (rápido, structured)
    const intent = await vercelAIService.classifyIntent(
      guardrails.processedText,
      '', // histórico real aqui depois
      tenantId,
    );

    // 4. Construir system prompt e few shot
    const { promptCacheService } = await import('../../infrastructure/ai/prompt-cache.service');
    const { fewShotService } = await import('../../infrastructure/ai/few-shot.service');

    const [systemPrompt, fewShotContext] = await Promise.all([
      promptCacheService.getSystemPrompt(tenantId),
      fewShotService.buildFewShotContext(message, tenantId),
    ]);
    
    // Legacy support for buildSystemPrompt to provide bot name
    const legacyPrompt = await buildSystemPrompt({
      tenantId,
      ragContext: ragContext || undefined,
    });
    
    const fullContext = fewShotContext
      ? `${systemPrompt}\n\n${fewShotContext}`
      : systemPrompt;

    // 5. Tool executor para este tenant
    const toolsExecutor = new ToolsExecutor(tenantId);

    // 6. Configurar SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (data: object) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // 7. Streaming com Vercel AI SDK e Function Calling
      const result = await vercelAIService.streamWithTools(
        [{ role: 'user', content: guardrails.processedText }],
        `Intent detectada: ${intent.intent} | Urgência: ${intent.urgency}\n\n${fullContext}`,
        tenantId,
        async (toolName, args) => toolsExecutor.execute(toolName, args as Record<string, unknown>),
      );

      for await (const chunk of result.textStream) {
        if (chunk) {
          sendEvent({ type: 'token', content: chunk });
        }
      }

      sendEvent({
        type: 'done',
        ragUsed: !!ragContext,
        botName: legacyPrompt.botName,
      });

    } catch (err) {
      sendEvent({ type: 'error', message: 'Erro ao gerar resposta. Tente novamente.' });
    } finally {
      reply.raw.end();
    }
  });
}
