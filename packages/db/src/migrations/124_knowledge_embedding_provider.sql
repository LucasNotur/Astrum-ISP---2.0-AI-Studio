-- 124_knowledge_embedding_provider.sql
-- Fan-out de embeddings por provider (OpenAI -> Gemini quando OpenAI falha/sem
-- crédito). Rastreia qual provider gerou os vetores de cada documento/artigo,
-- pra saber em qual coleção Qdrant procurar na hora da busca (Fase 2, fan-out
-- de leitura). Aplicada via MCP em 2026-08-27.
--
-- NULL = pré-fan-out (todo dado existente foi indexado só com OpenAI, na
-- coleção sem sufixo `tenant_{tenantId}` — sem rename, sem migração de dados
-- no Qdrant). Só documentos indexados a partir de agora podem ter 'google'.

ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS embedding_provider TEXT;
ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS embedding_provider TEXT;

COMMENT ON COLUMN knowledge_documents.embedding_provider IS 'Provider que gerou os embeddings deste documento (openai|google). NULL = pré-fan-out, assume openai (coleção sem sufixo).';
COMMENT ON COLUMN knowledge_articles.embedding_provider IS 'Provider que gerou os embeddings deste artigo (openai|google). NULL = pré-fan-out, assume openai (coleção sem sufixo).';
