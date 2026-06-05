import { QdrantClient } from '@qdrant/js-client-rest';
import { openai as openaiClient } from 'openai';
import { infraLogger } from '../logging/logger';
import { getRedisClient } from '../cache/redis.client';

/**
 * Few-Shot Prompting Dinâmico
 *
 * ESTRATÉGIA (Bloco 2 — Engenharia de Prompts):
 * - Buscar no Qdrant os 3 tickets RESOLVIDOS mais similares à query atual
 * - Injetar como exemplos "antes → depois" no prompt
 * - Resultado: IA aprende o padrão de resposta do ISP específico sem fine-tuning
 *
 * EXEMPLO de injeção:
 *   Exemplo 1:
 *   Cliente: "Minha internet tá caindo toda hora"
 *   Resolução: "Identificamos instabilidade no OLT. Reiniciei sua porta PON. Verifique em 10 minutos."
 *
 * CACHE: exemplos cacheados no Redis por 30 minutos para queries similares
 */

interface ResolvedTicketExample {
  customerMessage: string;
  agentResolution: string;
  category: string;
  satisfaction_score?: number;
}

export class FewShotService {
  private redis = getRedisClient();

  constructor(
    private readonly qdrant: QdrantClient,
    private readonly openaiSdk: typeof openaiClient.prototype,
  ) {}

  /**
   * Busca 3 exemplos resolvidos similares e formata para injeção no prompt.
   */
  async buildFewShotContext(
    query: string,
    tenantId: string,
    maxExamples = 3,
  ): Promise<string> {
    const cacheKey = `few_shot:${tenantId}:${Buffer.from(query).toString('base64').slice(0, 32)}`;

    // Cache de 30 minutos para queries similares
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    try {
      // Gerar embedding da query
      const embeddingResponse = await this.openaiSdk.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
      });
      const queryVector = embeddingResponse.data[0].embedding;

      // Buscar tickets resolvidos similares no Qdrant
      const collectionName = `resolved_tickets_${tenantId}`;
      const results = await this.qdrant.search(collectionName, {
        vector: queryVector,
        limit: maxExamples,
        filter: {
          must: [
            { key: 'status', match: { value: 'resolved' } },
            { key: 'has_resolution', match: { value: true } },
          ],
        },
        with_payload: true,
        score_threshold: 0.75, // só exemplos realmente similares
      });

      if (results.length === 0) return '';

      // Formatar exemplos
      const examples = results.map((result, i) => {
        const payload = result.payload as ResolvedTicketExample;
        return `
EXEMPLO ${i + 1} (score de satisfação: ${payload.satisfaction_score ?? 'N/A'}):
Cliente: "${payload.customerMessage}"
Resolução do agente: "${payload.agentResolution}"
Categoria: ${payload.category}`.trim();
      });

      const context = `
## EXEMPLOS DE ATENDIMENTOS RESOLVIDOS (use como referência de qualidade):
${examples.join('\n\n')}

## Agora atenda o cliente atual com a mesma qualidade:`.trim();

      // Cache por 30 minutos
      await this.redis.setex(cacheKey, 60 * 30, context);

      infraLogger.info({
        tenantId,
        examplesFound: results.length,
        query: query.slice(0, 50),
      }, 'Few-shot examples found');

      return context;

    } catch (err) {
      // Fail-open: se Qdrant falhar, continuar sem few-shot
      infraLogger.warn({ err, tenantId }, 'Few-shot search failed — continuing without examples');
      return '';
    }
  }

  /**
   * Indexa ticket resolvido como exemplo para uso futuro.
   * Chamado automaticamente quando ticket é fechado com resolução.
   */
  async indexResolvedTicket(
    tenantId: string,
    ticket: {
      id: string;
      customerMessage: string;
      agentResolution: string;
      category: string;
      satisfactionScore?: number;
    },
  ): Promise<void> {
    try {
      const collectionName = `resolved_tickets_${tenantId}`;

      // Embedding da mensagem do cliente
      const embeddingResponse = await this.openaiSdk.embeddings.create({
        model: 'text-embedding-3-small',
        input: ticket.customerMessage,
      });
      const vector = embeddingResponse.data[0].embedding;

      await this.qdrant.upsert(collectionName, {
        wait: true,
        points: [{
          id: ticket.id,
          vector,
          payload: {
            customerMessage: ticket.customerMessage,
            agentResolution: ticket.agentResolution,
            category: ticket.category,
            satisfaction_score: ticket.satisfactionScore,
            status: 'resolved',
            has_resolution: true,
            indexed_at: new Date().toISOString(),
          },
        }],
      });

      infraLogger.info({ tenantId, ticketId: ticket.id }, 'Resolved ticket indexed for few-shot');
    } catch (err) {
      infraLogger.error({ err, tenantId }, 'Failed to index resolved ticket');
    }
  }
}
