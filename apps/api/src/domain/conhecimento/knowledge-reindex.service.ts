import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { aiProcessingQueue, type IndexingJobData } from '../../../../../packages/queue/src/workers/indexing.worker';
import { generateEmbedding } from '../../adapters/ai/embedding.service';
import { searchSimilar } from '../../adapters/vector/qdrant.adapter';

export interface ReindexStatus {
  status: 'running' | 'completed';
  indexed: number;
  total: number;
}

/** Enfileira TODOS os artigos do tenant para reindexação (marca pending antes de enfileirar). */
export async function reindexAllArticles(tenantId: string): Promise<{ queued: number }> {
  const { data: articles, error } = await supabaseAdmin
    .from('knowledge_articles')
    .select('id, title, content')
    .eq('tenant_id', tenantId);
  if (error) throw error;
  if (!articles || articles.length === 0) return { queued: 0 };

  const ids = articles.map((a) => a.id);
  await supabaseAdmin.from('knowledge_articles').update({ ingest_status: 'pending' }).in('id', ids);

  for (const article of articles) {
    await enqueueArticleIndexing(tenantId, article.id, article.title, article.content);
  }
  return { queued: articles.length };
}

/** Enfileira UM artigo específico (verifica ownership por tenant antes). */
export async function reindexOneArticle(tenantId: string, articleId: string): Promise<boolean> {
  const { data: article, error } = await supabaseAdmin
    .from('knowledge_articles')
    .select('id, title, content')
    .eq('id', articleId)
    .eq('tenant_id', tenantId) // nunca confiar só no :id da URL — isolamento de tenant
    .maybeSingle();
  if (error) throw error;
  if (!article) return false;

  await supabaseAdmin.from('knowledge_articles').update({ ingest_status: 'pending' }).eq('id', articleId);
  await enqueueArticleIndexing(tenantId, article.id, article.title, article.content);
  return true;
}

async function enqueueArticleIndexing(tenantId: string, articleId: string, title: string, content: string): Promise<void> {
  const jobData: IndexingJobData = {
    tenantId,
    documentId: articleId, // indexing.worker usa este campo como chave genérica; para artigo é o mesmo id
    articleId,
    filename: title,
    fileType: 'text',
    textContent: content,
    entityType: 'article',
  };
  await aiProcessingQueue.add('index-article', jobData);
}

/** Status calculado ao vivo a partir de knowledge_articles — sem estado novo em Redis. */
export async function getReindexStatus(tenantId: string): Promise<ReindexStatus> {
  const { data, error } = await supabaseAdmin
    .from('knowledge_articles')
    .select('ingest_status')
    .eq('tenant_id', tenantId);
  if (error) throw error;

  const total = data?.length ?? 0;
  const pending = data?.filter((a) => a.ingest_status === 'pending').length ?? 0;
  const indexed = data?.filter((a) => a.ingest_status === 'indexed').length ?? 0;

  return { status: pending > 0 ? 'running' : 'completed', indexed, total };
}

export interface SearchTestResult {
  results: Array<{ title: string; score: number; text: string }>;
  latency_ms: number;
}

/** Busca de teste: embedda a query e retorna os chunks mais próximos no Qdrant do tenant. */
export async function runSearchTest(tenantId: string, query: string): Promise<SearchTestResult> {
  const start = Date.now();
  const vector = await generateEmbedding(query, tenantId);
  const hits = await searchSimilar(tenantId, vector, { limit: 5, scoreThreshold: 0.7 });
  const latency_ms = Date.now() - start;

  return {
    results: hits.map((h) => ({ title: h.filename, score: h.score, text: h.chunkText })),
    latency_ms,
  };
}
