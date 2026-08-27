# HANDOFF — Fan-out de embeddings por provider (Fase 1: caminho de ESCRITA/ingestão)

---

## ⛔ CONTRATO DE EXECUÇÃO — LEIA E OBEDEÇA ANTES DE TUDO

Escopo **ESTRITO**. Cumpra à risca.

### 1. Contexto (não é decisão sua, é o motivo do trabalho)

Hoje, se a chave `OPENAI_API_KEY` fica sem crédito (aconteceu de verdade em
2026-08-27, `insufficient_quota`), **toda ingestão de documento novo no RAG
trava** — `generateEmbeddingsBatch()` (`embedding.service.ts`) só sabe chamar
OpenAI, sem fallback, e o worker de indexação marca o documento como `failed`.
O dono do produto já tinha um router de failover multi-provider pronto pra
CHAT (`apps/api/src/infrastructure/ai/providers/model-router.ts` —
`withFailover`/`getModel`, valida cross-provider desde 2026-08-23), mas
**embeddings nunca foram ligados nele** — é um caminho de código totalmente
separado.

**Decisão de arquitetura já tomada (não é sua, só implemente):** em vez de
"trocar de provider e seguir", que corromperia silenciosamente a busca
(vetores de OpenAI e Gemini vivem em espaços matemáticos incompatíveis — não
dá pra misturar no mesmo índice e comparar por cosseno), a solução é
**coleção Qdrant separada por provider**. `tenant_{tenantId}` (sem sufixo,
como já existe hoje) continua sendo SEMPRE a coleção OpenAI — nenhuma
coleção existente é renomeada ou precisa de migração de dados. Só quando a
OpenAI falhar, os vetores daquele lote vão para uma coleção NOVA,
`tenant_{tenantId}_google`, com os embeddings do Gemini.

**Esta rodada (Fase 1) só cobre o caminho de ESCRITA (ingestão de
documentos)** — a query/busca (leitura) continua só-OpenAI por enquanto; ela
tem 3+ implementações espalhadas pelo repo que replicam "gerar embedding da
query + buscar no Qdrant" cada uma do seu jeito (`chat-stream.routes.ts`,
`infrastructure/rag/rag-query.service.ts`, `domain/ia/rag-query.service.ts`
via `hybrid-search.service.ts`, `knowledge-reindex.service.ts`) — juntar
fan-out de leitura nelas é tarefa maior, fica pra uma Fase 2 à parte. Por
isso esta rodada é cirúrgica: só o pipeline de ingestão (`indexing.worker.ts`)
muda de comportamento.

**Já feito pelo Claude (não refaça):**
- Migration `124_knowledge_embedding_provider.sql` — **já aplicada em
  produção via MCP**. Adiciona `embedding_provider TEXT` (nullable) em
  `knowledge_documents` e `knowledge_articles`. **Não crie migration nova,
  não rode nada de DDL.**
- `@ai-sdk/google` (v3.0.68) e `ai` (v6.0.197, com `embedMany`/`embed`) **já
  estão instalados** em `apps/api/package.json` — usados hoje só pra chat
  (`model-router.ts`). **NÃO rode `npm install`, não mexa em
  `package.json`/`package-lock.json`.**

### 2. Lista EXAUSTIVA de arquivos permitidos

**EDITAR:**
1. `apps/api/src/adapters/ai/embedding.service.ts`
2. `apps/api/src/adapters/vector/qdrant.adapter.ts`
3. `apps/api/src/adapters/vector/qdrant.adapter.test.ts`
4. `packages/queue/src/workers/indexing.worker.ts`

**CRIAR:**
5. `apps/api/src/adapters/ai/embedding.service.test.ts` (não existe hoje —
   gap pré-existente, você está criando o arquivo do zero)
6. `packages/queue/src/workers/indexing.worker.test.ts` (idem — não existe
   hoje)

**NÃO TOCAR:** a migration `124_knowledge_embedding_provider.sql` (já
aplicada, não mexe), `apps/api/src/infrastructure/ai/providers/model-router.ts`
(só IMPORTE `getProviderApiKey` dele, não edite nada nele),
`apps/api/src/lib/tenant-keys.ts` (só importe `resolveTenantAiKeys`, já
pronto), `apps/api/src/infrastructure/rag/document-extractor.service.ts`,
`apps/api/src/infrastructure/rag/document-chunker.service.ts`,
`packages/queue/src/workers/documents.worker.ts`, e **todo o caminho de
LEITURA/busca** — não toque em nenhum destes, mesmo que pareça relacionado:
`apps/api/src/domain/ia/chat-stream.routes.ts`,
`apps/api/src/infrastructure/rag/rag-query.service.ts`,
`apps/api/src/domain/ia/rag-query.service.ts`,
`apps/api/src/infrastructure/rag/hybrid-search.service.ts`,
`apps/api/src/domain/conhecimento/knowledge-reindex.service.ts`,
`apps/api/src/domain/onboarding/onboarding.service.ts`,
`apps/api/src/domain/provedor/lgpd-expunge.service.ts`, `apps/api/src/server.ts`
(rota `/api/v2/health`) — todos ficam Fase 2, fora de escopo aqui.

**Ações proibidas:** instalar dependência nova; `git push` (só commit local);
`git add -A`/`.`; qualquer migration/DDL nova; renomear ou apagar qualquer
coleção Qdrant existente; inventar um 3º provider (só openai/google, nesta
ordem, nesta rodada); mudar a assinatura de `generateEmbeddingsBatch()` ou
`generateEmbedding()` já existentes (ficam intactas — Fase 2 as usa; você só
ADICIONA função nova ao lado).

Se o código real divergir do descrito aqui, **PARE e reporte** — não
adivinhe, não invente por conta própria.

---

## 3. `apps/api/src/adapters/ai/embedding.service.ts` — o que ADICIONAR

Estado atual do arquivo (não mude nada disso, só adicione depois):
```ts
import { createOpenAIClient } from '../openai/openai.adapter';
import { iaLogger } from '../../infrastructure/logging/logger';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_BATCH_SIZE = 100;

export async function generateEmbedding(...) { ... }
export async function generateEmbeddingsBatch(...) { ... }
```

Adicione os imports novos no topo (junto aos já existentes):
```ts
import { embedMany } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { getProviderApiKey } from '../../infrastructure/ai/providers/model-router';
import { resolveTenantAiKeys } from '../../lib/tenant-keys';
```

E, no FIM do arquivo (depois de `generateEmbeddingsBatch`), adicione:
```ts
const GOOGLE_EMBEDDING_MODEL = 'gemini-embedding-001';

export type EmbeddingProvider = 'openai' | 'google';

export interface EmbeddingBatchResult {
  provider: EmbeddingProvider;
  embeddings: number[][];
}

/**
 * Embeddings via Gemini — fallback quando a OpenAI falha (sem crédito, rate
 * limit, etc.). Mesmo padrão de resolução de chave do model-router.ts
 * (buildLanguageModel): cria o client explicitamente com a key resolvida,
 * não confia no lookup implícito de env var do SDK.
 */
async function generateEmbeddingsBatchGoogle(
  texts: string[],
  tenantId?: string
): Promise<number[][]> {
  const tenantKeys = tenantId ? await resolveTenantAiKeys(tenantId) : {};
  const apiKey = getProviderApiKey('google', tenantKeys);
  const google = createGoogleGenerativeAI({ apiKey });

  const { embeddings } = await embedMany({
    model: google.textEmbeddingModel(GOOGLE_EMBEDDING_MODEL),
    values: texts,
  });

  iaLogger.info(
    { tenantId, count: texts.length },
    'Embeddings gerados via Gemini (fallback)'
  );

  return embeddings;
}

/**
 * Igual a generateEmbeddingsBatch, mas cai pro Gemini se a OpenAI falhar (sem
 * crédito, rate limit, erro de rede) em vez de propagar o erro direto.
 *
 * USADO SÓ pela ingestão de documentos (indexing.worker.ts). Os caminhos de
 * busca/query (chat, RAG query) continuam usando generateEmbedding/
 * generateEmbeddingsBatch (só-OpenAI) — fan-out de leitura é fase separada,
 * não mexer nisso aqui.
 */
export async function generateEmbeddingsBatchWithFailover(
  texts: string[],
  tenantId?: string
): Promise<EmbeddingBatchResult> {
  if (texts.length === 0) return { provider: 'openai', embeddings: [] };

  try {
    const embeddings = await generateEmbeddingsBatch(texts, tenantId);
    return { provider: 'openai', embeddings };
  } catch (err) {
    iaLogger.warn(
      { err, tenantId, count: texts.length },
      'Embeddings OpenAI falharam — tentando fallback Gemini'
    );
    const embeddings = await generateEmbeddingsBatchGoogle(texts, tenantId);
    return { provider: 'google', embeddings };
  }
}
```

**Se o tipo retornado por `google.textEmbeddingModel(...)` não bater
exatamente com o que `embedMany({ model: ... })` espera** (fricção de tipos
entre `@ai-sdk/google` e `ai`, já aconteceu antes neste repo com
`parameters`→`inputSchema` do AI SDK — ver `CHECKLIST_PENDENCIAS_EXTERNAS.md`
S74), ajuste a forma da chamada conforme o erro REAL do `tsc`, não invente —
e relate no report final.

**Teste (`embedding.service.test.ts`, arquivo novo):** mocke `../openai/
openai.adapter` (`createOpenAIClient`), `ai` (`embedMany`) e `@ai-sdk/google`
(`createGoogleGenerativeAI`) no estilo `vi.mock` já usado em outros
`*.service.test.ts` de `apps/api/src/adapters/`/`infrastructure/`. Cobrir
`generateEmbeddingsBatchWithFailover`:
1. OpenAI funciona → retorna `{ provider: 'openai', embeddings: [...] }`,
   `embedMany`/Google NUNCA é chamado.
2. OpenAI lança erro (simule o client mockado de `createOpenAIClient`
   rejeitando) → cai pro Google, retorna `{ provider: 'google', embeddings:
   [...] }` com os embeddings vindos do `embedMany` mockado.
3. `texts` vazio → retorna `{ provider: 'openai', embeddings: [] }` SEM
   chamar nenhum dos dois clients.
4. OpenAI E Google falham → a função propaga o erro do Google (não silencia).

---

## 4. `apps/api/src/adapters/vector/qdrant.adapter.ts` — mudanças exatas

### 4.1 Novo tipo + `getTenantCollection`

Estado atual:
```ts
export function getTenantCollection(tenantId: string): string {
  return `tenant_${tenantId.replace(/-/g, '_')}`;
}
```
Mude para (adicione o type ANTES da função):
```ts
export type EmbeddingProviderName = 'openai' | 'google';

/**
 * Nome da coleção por tenant+provider. 'openai' mantém o nome SEM sufixo —
 * é o nome que TODA coleção em produção já usa hoje, nenhuma precisa ser
 * renomeada. Só 'google' ganha sufixo, é a única coleção nova.
 */
export function getTenantCollection(tenantId: string, provider: EmbeddingProviderName = 'openai'): string {
  const base = `tenant_${tenantId.replace(/-/g, '_')}`;
  return provider === 'openai' ? base : `${base}_${provider}`;
}
```

### 4.2 `ensureCollection` — adicionar `provider` e `vectorSize`

Estado atual (assinatura e os 2 lugares que usam `VECTOR_DIMENSIONS`):
```ts
export async function ensureCollection(tenantId: string): Promise<void> {
  const qdrant = getQdrantClient();
  const collectionName = getTenantCollection(tenantId);
  ...
  await qdrant.createCollection(collectionName, {
    vectors: {
      size: VECTOR_DIMENSIONS,
      distance: DISTANCE_METRIC,
    },
    ...
  });
  ...
  infraLogger.info({ collectionName, dimensions: VECTOR_DIMENSIONS }, 'Coleção Qdrant criada');
}
```
Mude para:
```ts
export async function ensureCollection(
  tenantId: string,
  provider: EmbeddingProviderName = 'openai',
  vectorSize: number = VECTOR_DIMENSIONS,
): Promise<void> {
  const qdrant = getQdrantClient();
  const collectionName = getTenantCollection(tenantId, provider);
  ...
  await qdrant.createCollection(collectionName, {
    vectors: {
      size: vectorSize,
      distance: DISTANCE_METRIC,
    },
    ...
  });
  ...
  infraLogger.info({ collectionName, dimensions: vectorSize, provider }, 'Coleção Qdrant criada');
}
```
(as duas linhas com `...` acima — `getCollection`/`createPayloadIndex` no
meio — continuam IDÊNTICAS, só as linhas mostradas mudam.) Note que os
parâmetros novos têm default `'openai'`/`VECTOR_DIMENSIONS` — **todo caller
existente que chama `ensureCollection(tenantId)` sem os novos argumentos
continua funcionando exatamente igual a hoje**, sem precisar editar nada
fora da lista de arquivos permitidos (ex.: `onboarding.service.ts` não muda).

### 4.3 `upsertPoints` — adicionar `provider`

Estado atual:
```ts
export async function upsertPoints(
  tenantId: string,
  points: VectorPoint[]
): Promise<void> {
  const qdrant = getQdrantClient();
  const collectionName = getTenantCollection(tenantId);
  ...
  infraLogger.info({ tenantId, count: points.length }, 'Pontos inseridos no Qdrant');
}
```
Mude para:
```ts
export async function upsertPoints(
  tenantId: string,
  points: VectorPoint[],
  provider: EmbeddingProviderName = 'openai',
): Promise<void> {
  const qdrant = getQdrantClient();
  const collectionName = getTenantCollection(tenantId, provider);
  ...
  infraLogger.info({ tenantId, provider, count: points.length }, 'Pontos inseridos no Qdrant');
}
```
(o corpo do `.upsert(...)` no meio continua idêntico.)

### 4.4 `VectorPoint` — campo novo no payload

Estado atual:
```ts
export interface VectorPoint {
  id: string;
  vector: number[];
  payload: {
    document_id: string | null;
    article_id?: string | null;
    entity_type?: 'document' | 'article';
    tenant_id: string;
    filename: string;
    chunk_index: number;
    chunk_text: string;
    file_type: string;
    created_at: string;
  };
}
```
Adicione `embedding_provider?: EmbeddingProviderName;` no fim do objeto
`payload` (depois de `created_at: string;`).

### 4.5 Teste (`qdrant.adapter.test.ts`, arquivo existente — EDITAR)

Siga o padrão de mock já usado no arquivo (`vi.mock('@qdrant/js-client-rest', ...)`
ou o que já estiver lá — confira antes de escrever). Adicione:
1. `getTenantCollection(tenantId)` sem provider → nome sem sufixo (igual
   comportamento anterior, regressão).
2. `getTenantCollection(tenantId, 'google')` → nome com sufixo `_google`.
3. `ensureCollection(tenantId, 'google', 768)` → cria a coleção com
   `vectors.size: 768` (ou o vectorSize passado) na coleção sufixada, NÃO na
   coleção sem sufixo.
4. `upsertPoints(tenantId, points, 'google')` → chama `qdrant.upsert` na
   coleção sufixada.
5. Chamadas sem o 3º argumento (`provider`) continuam batendo na coleção sem
   sufixo — regressão do comportamento atual.

---

## 5. `packages/queue/src/workers/indexing.worker.ts` — mudanças exatas

Estado atual (a função `indexDocument` inteira):
```ts
async function indexDocument(job: Job<IndexingJobData>): Promise<void> {
  const { tenantId, documentId, filename, fileType, textContent, entityType = 'document', articleId } = job.data;

  iaLogger.info({ tenantId, documentId, articleId, entityType, filename }, 'Iniciando indexação RAG');

  // 1. Chunking
  const chunks = chunkTechnicalManual(textContent);
  iaLogger.info({ documentId, chunksCount: chunks.length }, 'Documento dividido em chunks');

  // 2. Garantir coleção no Qdrant
  await ensureCollection(tenantId);

  // 3. Gerar embeddings em batch
  const chunkTexts = chunks.map(c => c.text);
  const embeddings = await generateEmbeddingsBatch(chunkTexts, tenantId);

  // 4. Inserir no Qdrant (payload diferencia documento de artigo para permitir filtros futuros)
  const points = chunks.map((chunk, i) => {
    const vector = embeddings[i];
    if (!vector) throw new Error(`Embedding ausente para o chunk ${i} (${chunks.length} chunks, ${embeddings.length} embeddings)`);
    return {
    id: crypto.randomUUID(),
    vector,
    payload: {
      document_id: entityType === 'document' ? documentId : null,
      article_id: entityType === 'article' ? articleId : null,
      entity_type: entityType,
      tenant_id: tenantId,
      filename,
      chunk_index: chunk.chunkIndex,
      chunk_text: chunk.text,
      file_type: fileType,
      created_at: new Date().toISOString(),
    },
  };
  });

  await upsertPoints(tenantId, points);

  // 5. Atualizar status na tabela correta
  if (entityType === 'article' && articleId) {
    await supabaseAdmin.from('knowledge_articles').update({
      ingest_status: 'indexed',
      updated_at: new Date().toISOString(),
    }).eq('id', articleId);
    iaLogger.info({ tenantId, articleId, chunksCount: chunks.length }, '✅ Artigo KB indexado no RAG');
  } else {
    await supabaseAdmin.from('knowledge_documents').update({
      status: 'indexed',
      chunks_count: chunks.length,
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);
    iaLogger.info({ tenantId, documentId, chunksCount: chunks.length }, '✅ Documento indexado no RAG');
  }
}
```

Mude EXATAMENTE assim:

1. No import de `embedding.service`, troque `generateEmbeddingsBatch` por
   `generateEmbeddingsBatchWithFailover`:
```ts
import { generateEmbeddingsBatchWithFailover } from '../../../../apps/api/src/adapters/ai/embedding.service';
```
(confirme o path relativo exato contra o import atual do arquivo — só troca
o nome importado, o resto do path já está certo hoje.)

2. Passo 2 (`ensureCollection`) e passo 3 (embeddings) — troque:
```ts
  // 3. Gerar embeddings em batch (falha na OpenAI cai pro Gemini)
  const chunkTexts = chunks.map(c => c.text);
  const { provider, embeddings } = await generateEmbeddingsBatchWithFailover(chunkTexts, tenantId);

  // 2. Garantir coleção no Qdrant (na coleção do provider que respondeu)
  await ensureCollection(tenantId, provider, embeddings[0]?.length ?? 1536);
```
(troquei a ORDEM — embeddings antes de ensureCollection — porque agora
`ensureCollection` precisa saber o `vectorSize` real, que só se sabe depois
de gerar o primeiro embedding. Mantenha os comentários numerados como estão
acima, só ajuste a ordem de execução.)

3. No `points.map`, adicione `embedding_provider: provider` no objeto
   `payload` (mesmo nível de `created_at`):
```ts
    payload: {
      document_id: entityType === 'document' ? documentId : null,
      article_id: entityType === 'article' ? articleId : null,
      entity_type: entityType,
      tenant_id: tenantId,
      filename,
      chunk_index: chunk.chunkIndex,
      chunk_text: chunk.text,
      file_type: fileType,
      created_at: new Date().toISOString(),
      embedding_provider: provider,
    },
```

4. `upsertPoints(tenantId, points)` → `upsertPoints(tenantId, points, provider)`.

5. Nos DOIS updates do passo 5 (branch `article` e branch `document`),
   adicione `embedding_provider: provider` no objeto do `.update({...})`
   (mesmo nível de `updated_at`), nos dois branches:
```ts
    await supabaseAdmin.from('knowledge_articles').update({
      ingest_status: 'indexed',
      embedding_provider: provider,
      updated_at: new Date().toISOString(),
    }).eq('id', articleId);
```
```ts
    await supabaseAdmin.from('knowledge_documents').update({
      status: 'indexed',
      chunks_count: chunks.length,
      embedding_provider: provider,
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);
```

**Não mexa** no `worker.on('failed', ...)` handler nem em
`createIndexingWorker()` — ficam idênticos.

### Teste (`indexing.worker.test.ts`, arquivo novo)

Siga o mesmo estilo de mock de `documents.worker.test.ts` (mock de
`supabaseAdmin`, e aqui também de `chunkTechnicalManual`,
`generateEmbeddingsBatchWithFailover`, `ensureCollection`/`upsertPoints`) —
não precisa de Redis/BullMQ real, teste só a função `indexDocument` isolada
(exporte-a também se precisar, ou monte um `Job` fake `{data: {...}} as Job`).
Cobrir, no mínimo:
1. Caminho feliz com `provider: 'openai'` (mock de
   `generateEmbeddingsBatchWithFailover` retornando `{provider:'openai',
   embeddings:[...]}`) → `ensureCollection`/`upsertPoints` chamados SEM
   sufixo de provider explícito importar (ou seja, chamados com
   `'openai'`), update de `knowledge_documents` inclui
   `embedding_provider: 'openai'`.
2. Caminho de fallback com `provider: 'google'` → `ensureCollection`/
   `upsertPoints` chamados com `'google'`, update inclui
   `embedding_provider: 'google'`.
3. `entityType: 'article'` → update vai pra `knowledge_articles` com
   `embedding_provider` incluído (mesmo teste, branch diferente).
4. Erro se `embeddings.length !== chunks.length` (comportamento já existente,
   não deve quebrar com a mudança — teste de regressão).

---

## 6. Verificação mecânica obrigatória

```bash
grep -n "generateEmbeddingsBatchWithFailover" packages/queue/src/workers/indexing.worker.ts apps/api/src/adapters/ai/embedding.service.ts
```
Tem que aparecer nos dois arquivos.
```bash
grep -n "embedding_provider" apps/api/src/adapters/vector/qdrant.adapter.ts packages/queue/src/workers/indexing.worker.ts
```
Tem que aparecer nos dois.

## 7. Definition of Done

1. Baseline de typecheck ANTES (`cd apps/api && npx tsc --noEmit 2>&1 | grep -c "error TS"`)
   e DEPOIS — não pode aumentar. Se `@ai-sdk/google`/`ai` derem erro de tipo
   na chamada de `embedMany`/`textEmbeddingModel`, ajuste a forma da chamada
   conforme o erro real do TS (os tipos já estão instalados, não precisa
   `@types/*` novo) e relate o desvio.
2. `npx vitest run apps/api/src/adapters/ai/embedding.service.test.ts
   apps/api/src/adapters/vector/qdrant.adapter.test.ts
   packages/queue/src/workers/indexing.worker.test.ts` verde (rodar da raiz
   do repo).
3. Verificação mecânica da seção 6 limpa.
4. `git status` mostra só os 6 arquivos desta lista (4 EDITAR + 2 CRIAR).
5. 1 commit local (`git add` só esses 6 arquivos, nunca `-A`/`.`), sem
   `git push`.

## 8. Report final obrigatório

Ao terminar, reporte: (1) diff resumido por arquivo; (2) resultado do
vitest (comandos + saída) e do typecheck (antes/depois); (3) qualquer
divergência entre o que este doc descreve e o código real que você
encontrou, em especial se a chamada de `embedMany`/`textEmbeddingModel` do
`@ai-sdk/google` precisou de ajuste de tipo; (4) confirme que NENHUM arquivo
de leitura/busca (RAG query, chat-stream, hybrid-search, onboarding, LGPD,
health-check) foi tocado.

Se algo aqui conflitar com um impulso seu de "melhorar" — por exemplo, "já
que estou aqui, vou ligar o fan-out na leitura também" — o contrato ganha.
Isso é Fase 2, fora de escopo. Fim do contrato.

---

> Escrito pelo Claude em 2026-08-27. Contexto: o dono do produto perguntou
> por que a chave OpenAI sem crédito não caiu pro Gemini, já que existe
> router de failover — resposta: o router (`model-router.ts`) só cobre chat,
> nunca foi ligado a embeddings, e um fallback ingênuo (trocar provider e
> upsertar no mesmo índice) corromperia a busca silenciosamente por misturar
> espaços vetoriais incompatíveis. Decisão: coleção separada por provider.
> Fase 1 (este doc) resolve só a ingestão travar; Fase 2 (fan-out na busca,
> tocando os 3+ call sites de query espalhados pelo repo) fica pra depois.
