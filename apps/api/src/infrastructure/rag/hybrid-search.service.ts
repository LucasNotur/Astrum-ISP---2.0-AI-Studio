import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import { infraLogger } from '../logging/logger';

/**
 * Hybrid Search: Semântica (Dense) + BM25 (Sparse)
 *
 * ESTRATÉGIA (Bloco 3 — Busca Híbrida):
 * - Busca semântica (dense vectors): captura o SIGNIFICADO da query
 * - BM25 (sparse vectors): captura PALAVRAS-CHAVE exatas (ex: "TP-Link AX1500", "PPPoE", IPs)
 * - Score final: 0.7 × semântico + 0.3 × BM25
 *
 * POR QUÊ HÍBRIDO?
 * - Semântico puro: entende "internet lenta" mas erra "TP-Link AX1500 luz vermelha"
 * - BM25 puro: acha "AX1500" mas não entende "meu roteador tá com problema"
 * - Híbrido: melhor dos dois mundos para ISP (termos técnicos + linguagem natural)
 *
 * HyDE (Hypothetical Document Embeddings):
 * - Para queries vagas ("A internet tá ruim"), a IA gera um laudo técnico hipotético
 * - Usa o embedding DESSE laudo para buscar (muito mais rico semanticamente)
 * - Resultado: busca muito mais precisa para queries vagas
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy_key' });

export interface HybridSearchResult {
  id: string;
  content: string;
  filename: string;
  score: number;
  denseScore: number;
  sparseScore: number;
  chunk_index: number;
}

export interface SearchOptions {
  limit?: number;
  scoreThreshold?: number;
  useHyDE?: boolean; // ativar HyDE para queries vagas
  hydeSensitivity?: 'always' | 'auto' | 'never';
}

export class HybridSearchService {
  constructor(
    private readonly qdrant: QdrantClient,
    private readonly embeddingModel = 'text-embedding-3-small',
  ) {}

  /**
   * Busca híbrida principal.
   * Detecta automaticamente se deve usar HyDE.
   */
  async search(
    query: string,
    tenantId: string,
    options: SearchOptions = {},
  ): Promise<HybridSearchResult[]> {
    const {
      limit = 5,
      scoreThreshold = 0.65,
      hydeSensitivity = 'auto',
    } = options;

    const collectionName = `knowledge_${tenantId}`;

    // Decidir se aplica HyDE
    const isQueryVague = this._isQueryVague(query);
    const applyHyDE = hydeSensitivity === 'always'
      || (hydeSensitivity === 'auto' && isQueryVague);

    infraLogger.info({
      query: query.slice(0, 60),
      tenantId,
      applyHyDE,
      isQueryVague,
    }, 'Starting hybrid search');

    // 1. Gerar embedding da query (ou HyDE)
    const searchQuery = applyHyDE
      ? await this._generateHyDEDocument(query)
      : query;

    if (applyHyDE) {
      infraLogger.debug({ hydeDoc: searchQuery.slice(0, 100) }, 'HyDE document generated');
    }

    const [denseVector, sparseVector] = await Promise.all([
      this._generateDenseEmbedding(searchQuery),
      this._generateSparseVector(query), // BM25 usa sempre a query original
    ]);

    // 2. Busca densa (semântica)
    const denseResults = await this.qdrant.search(collectionName, {
      vector: { name: 'dense', vector: denseVector },
      limit: limit * 2, // buscar mais para re-ranquear
      score_threshold: scoreThreshold - 0.1,
      with_payload: true,
      with_vector: false,
    });

    // 3. Busca esparsa (BM25)
    let sparseResults: typeof denseResults = [];
    try {
      sparseResults = await this.qdrant.search(collectionName, {
        vector: { name: 'sparse', vector: sparseVector as any },
        limit: limit * 2,
        score_threshold: 0.01,
        with_payload: true,
        with_vector: false,
      });
    } catch {
      // BM25 pode não estar configurado em coleções antigas — fail gracefully
      infraLogger.debug({ tenantId }, 'Sparse search not available — using dense only');
    }

    // 4. Fusão de scores (Reciprocal Rank Fusion + pesos)
    const merged = this._reciprocalRankFusion(denseResults, sparseResults, {
      denseWeight: 0.7,
      sparseWeight: 0.3,
      k: 60, // constante RRF padrão
    });

    // 5. Filtrar por threshold e retornar top N
    return merged
      .filter(r => r.score >= scoreThreshold)
      .slice(0, limit)
      .map(r => ({
        id: String(r.id),
        content: r.payload?.content as string ?? '',
        filename: r.payload?.filename as string ?? '',
        score: r.score,
        denseScore: r.denseScore,
        sparseScore: r.sparseScore,
        chunk_index: r.payload?.chunk_index as number ?? 0,
      }));
  }

  // ─── HyDE ─────────────────────────────────────────────────────────────────

  /**
   * Gera um documento técnico hipotético baseado na query vaga.
   * A IA "imagina" o que seria a resposta ideal — o embedding desse texto
   * é muito mais rico que o da query curta original.
   */
  private async _generateHyDEDocument(query: string): Promise<string> {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um técnico sênior de ISP. Baseado na reclamação do cliente,
escreva um laudo técnico detalhado (2-3 parágrafos) descrevendo:
- O problema técnico específico
- As possíveis causas
- Os procedimentos de diagnóstico e resolução
Escreva como se fosse um documento técnico real do manual de suporte.`,
        },
        { role: 'user', content: `Reclamação: "${query}"` },
      ],
      max_tokens: 400,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content ?? query;
  }

  /**
   * Detecta queries vagas que se beneficiariam do HyDE.
   * Queries curtas, sem termos técnicos, com linguagem coloquial.
   */
  private _isQueryVague(query: string): boolean {
    const wordCount = query.trim().split(/\s+/).length;
    const hasTechnicalTerms = /\b(OLT|PPPoE|DHCP|DNS|IP|MAC|VLAN|fibra|óptico|roteador|modem|Hz|Mbps|MHz)\b/i.test(query);
    const isShort = wordCount < 6;
    const isColloquial = /\b(tá|tô|tava|ruim|lento|caiu|não pega|não funciona|caindo)\b/i.test(query);

    return (isShort || isColloquial) && !hasTechnicalTerms;
  }

  // ─── Embeddings ───────────────────────────────────────────────────────────

  private async _generateDenseEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: this.embeddingModel,
      input: text.slice(0, 8000), // limite de tokens
    });
    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error('Fallback embedding failed');
    }
    return embedding;
  }

  /**
   * Gera sparse vector compatível com Qdrant (BM25-style).
   * Usa TF-IDF simplificado no lado do cliente.
   */
  private _generateSparseVector(text: string): { indices: number[]; values: number[] } {
    const tokens = text
      .toLowerCase()
      .replace(/[^a-záàâãéèêíïóôõöúüç\s]/gi, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);

    // Frequência dos termos (TF)
    const termFreq: Record<string, number> = {};
    for (const token of tokens) {
      termFreq[token] = (termFreq[token] ?? 0) + 1;
    }

    // Converter para índices numéricos (hash do termo)
    const indices: number[] = [];
    const values: number[] = [];

    for (const [term, freq] of Object.entries(termFreq)) {
      // Hash simples para índice (0 - 30000)
      const hash = Array.from(term).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 30000, 0);
      const tfScore = freq / tokens.length;

      indices.push(Math.abs(hash));
      values.push(tfScore);
    }

    return { indices, values };
  }

  // ─── Reciprocal Rank Fusion ───────────────────────────────────────────────

  /**
   * RRF: algoritmo padrão para fusão de rankings de diferentes buscas.
   * score_rrf = Σ ( weight / (k + rank) )
   */
  private _reciprocalRankFusion(
    denseResults: Array<{ id: string | number; score: number; payload?: Record<string, unknown> | null }>,
    sparseResults: Array<{ id: string | number; score: number; payload?: Record<string, unknown> | null }>,
    options: { denseWeight: number; sparseWeight: number; k: number },
  ) {
    const { denseWeight, sparseWeight, k } = options;
    const scores: Record<string, {
      id: string | number;
      score: number;
      denseScore: number;
      sparseScore: number;
      payload?: Record<string, unknown> | null;
    }> = {};

    // Contribuição da busca densa
    denseResults.forEach((result, rank) => {
      const key = String(result.id);
      scores[key] = scores[key] ?? { id: result.id, score: 0, denseScore: 0, sparseScore: 0, payload: result.payload };
      const contribution = denseWeight / (k + rank + 1);
      scores[key].score += contribution;
      scores[key].denseScore = result.score;
    });

    // Contribuição da busca esparsa
    sparseResults.forEach((result, rank) => {
      const key = String(result.id);
      scores[key] = scores[key] ?? { id: result.id, score: 0, denseScore: 0, sparseScore: 0, payload: result.payload };
      const contribution = sparseWeight / (k + rank + 1);
      scores[key].score += contribution;
      scores[key].sparseScore = result.score;
    });

    // Ordenar por score RRF decrescente
    return Object.values(scores).sort((a, b) => b.score - a.score);
  }
}
