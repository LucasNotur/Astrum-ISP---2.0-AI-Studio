# HANDOFF — Reindex + Search-test da Base de Conhecimento (KnowledgeBasePage)

---

## ⛔ CONTRATO DE EXECUÇÃO — LEIA E OBEDEÇA ANTES DE TUDO

Escopo **ESTRITO**. Cumpra à risca.

### 1. Objetivo (contexto, não decisão sua)

`src/pages/KnowledgeBasePage.tsx` tem 3 botões que hoje chamam rotas que **não existem em lugar
nenhum** do backend: `POST /api/knowledge/reindex`, `GET /api/knowledge/reindex/status`,
`POST /api/knowledge/search-test`, `POST /api/knowledge/articles/:id/reindex`. Todo clique dá 404
silencioso (o front não trata erro nesses handlers). O pipeline de chunking+embedding+Qdrant **já
existe e funciona** (`packages/queue/src/workers/indexing.worker.ts`, já usado pelo upload de
documentos) — só falta: (a) as rotas Fastify que enfileiram artigos nele, e (b) o front chamar
`/api/v2/...` em vez do `/api/...` morto. **Você NÃO vai criar pipeline de embedding novo — só vai
enfileirar artigos no pipeline que já existe.**

**Já verificado pelo Claude (não reinvestigue):**
- `createIndexingWorker()` (consome a fila `astrum:ai-processing`) já está registrado no boot do
  Fastify (`apps/api/src/server.ts`, commit `e2f64d2`) — antes não estava, já foi corrigido.
- A fila já suporta `entityType: 'article'` nativamente (usa `articleId`, atualiza
  `knowledge_articles.ingest_status`) — ver `packages/queue/src/workers/indexing.worker.ts:12-84`.
- A tabela `knowledge_articles` (migration 017) tem: `id UUID`, `tenant_id UUID`, `title TEXT`,
  `content TEXT NOT NULL` (texto puro, sem PDF/extração — pronto pra embeddar direto),
  `ingest_status TEXT DEFAULT 'pending' CHECK IN ('pending','indexed','failed')`. RLS ativa,
  policy `tenant_own_kb_articles`.
- **NÃO existe fila de embedding para `knowledge_documents` (upload de PDF) funcionando** — é um
  bug SEPARADO (outbox publica no nome de fila errado + falta extração de texto do PDF) que o
  Claude já registrou à parte. **Não mexa nisso, não é seu escopo.**

### 2. Lista EXAUSTIVA de arquivos permitidos

**CRIAR:**
1. `apps/api/src/domain/conhecimento/knowledge-reindex.routes.ts`
2. `apps/api/src/domain/conhecimento/knowledge-reindex.service.ts` (lógica pura, testável — DoD exige teste)
3. `apps/api/src/domain/conhecimento/knowledge-reindex.service.test.ts`

**EDITAR:**
4. `apps/api/src/server.ts` (SÓ registrar a rota nova, 2 linhas, mesmo padrão de `documentRoutes`)
5. `src/pages/KnowledgeBasePage.tsx` (repontar os 4 `fetch('/api/knowledge/...')` para `/api/v2/...`
   via `apiClient`, e corrigir 1 bug de badge — detalhado na seção 4)

**NÃO TOCAR:** `packages/queue/src/workers/indexing.worker.ts`, `apps/api/src/adapters/vector/
qdrant.adapter.ts`, `apps/api/src/adapters/ai/embedding.service.ts`, qualquer coisa de
`knowledge_documents` (upload de PDF), `outbox.service.ts`, `priority-queues.ts`.

**Ações proibidas:** instalar dependências novas; `git push` (só commit local); `git add -A`/`.`;
inventar um mecanismo de progresso com Redis/estado novo (a seção 3 já define exatamente como
calcular o status — não complique); mexer em `knowledge_documents`/upload de PDF.

Se o código real divergir do que está descrito aqui, **PARE e reporte** — não adivinhe.

---

## 3. Design das rotas (já decidido — implemente exatamente assim)

Arquivo novo `apps/api/src/domain/conhecimento/knowledge-reindex.service.ts` — funções PURAS
(recebem os dados prontos, sem I/O de rede/DB dentro delas onde der pra evitar; o que precisar de
Supabase pode ficar aqui mesmo, mas mantenha testável com mocks, no mesmo estilo de
`kb-draft.service.ts` no mesmo diretório — abra esse arquivo como referência de estilo/import antes
de começar).

```ts
// apps/api/src/domain/conhecimento/knowledge-reindex.service.ts
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { aiProcessingQueue, type IndexingJobData } from '../../../../packages/queue/src/workers/indexing.worker';
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
```

**Sobre `Date.now()`:** é código de produção normal (rota Fastify), não um script de workflow — pode
usar `Date.now()` livremente aqui, sem restrição.

Arquivo novo `apps/api/src/domain/conhecimento/knowledge-reindex.routes.ts` — siga o estilo de
`apps/api/src/domain/ia/documents.routes.ts` (auth + `requirePermission` + tenant do JWT, nunca do
body/query):

```ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { validateBody, validateParams } from '../../infrastructure/validation/zod-validator';
import {
  reindexAllArticles,
  reindexOneArticle,
  getReindexStatus,
  runSearchTest,
} from './knowledge-reindex.service';

const searchBody = z.object({ query: z.string().min(1).max(500) });
const articleParams = z.object({ id: z.string().uuid() });

export async function knowledgeReindexRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v2/knowledge/reindex', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'write')],
  }, async (request) => {
    const { tenantId } = (request as any).user;
    return reindexAllArticles(tenantId);
  });

  fastify.get('/api/v2/knowledge/reindex/status', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read')],
  }, async (request) => {
    const { tenantId } = (request as any).user;
    return getReindexStatus(tenantId);
  });

  fastify.post('/api/v2/knowledge/articles/:id/reindex', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'write'), validateParams(articleParams)],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const { id } = (request as any).validatedParams as { id: string };
    const ok = await reindexOneArticle(tenantId, id);
    if (!ok) {
      return reply.status(404).send({ code: 'ARTICLE_NOT_FOUND', message: 'Artigo não encontrado para este tenant.' });
    }
    return { queued: true };
  });

  fastify.post('/api/v2/knowledge/search-test', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('ai_config', 'read'), validateBody(searchBody)],
  }, async (request) => {
    const { tenantId } = (request as any).user;
    const { query } = (request as any).validatedBody as { query: string };
    return runSearchTest(tenantId, query);
  });
}
```

Confira o import relativo de `zod-validator`/`rbac.middleware`/`supabase.client` abrindo
`documents.routes.ts` real e copiando os paths exatos de lá (o exemplo acima pode ter path relativo
levemente diferente do seu arquivo novo — confirme, não copie cego).

**Registro em `server.ts`** — mesmo padrão de `documentRoutes` (linhas 113-114 hoje):
```ts
const { knowledgeReindexRoutes } = await import('./domain/conhecimento/knowledge-reindex.routes');
await app.register(knowledgeReindexRoutes);
```
Coloque perto do registro de `documentRoutes` (mesma área de rotas de conhecimento/IA).

**Teste (`knowledge-reindex.service.test.ts`)** — mock do `supabaseAdmin`, `aiProcessingQueue.add`,
`generateEmbedding`, `searchSimilar` (mesmo estilo de `kb-draft.service.test.ts`, que já mocka
Supabase no mesmo diretório — copie o padrão de lá). Cobrir pelo menos: `reindexAllArticles` conta
certo e marca pending antes de enfileirar; `reindexOneArticle` retorna `false` pra artigo de outro
tenant (isolamento); `getReindexStatus` calcula `running`/`completed` certo nos 3 casos (tudo
pending, tudo indexed, misto); `runSearchTest` mapeia `filename→title`, `chunkText→text`.

---

## 4. Frontend — `src/pages/KnowledgeBasePage.tsx`

Import no topo já tem `apiPost` mas não `apiGet` nem `api` — ajuste a linha de import existente
(ache a linha com `apiPost` hoje e adicione o que faltar, sem duplicar import):
```ts
import { api, apiGet, apiPost } from '@/src/lib/apiClient';
```

**4 substituições exatas** (troque o `fetch(...)` cru pelo `apiClient`; tenant já vem do JWT dentro
do `apiClient` — pode remover o `tenantId` do body/query):

1. `startReindex` (hoje `fetch('/api/knowledge/reindex', {method:'POST', ..., body: JSON.stringify({tenantId: currentTenant?.id})})`):
```ts
const startReindex = async () => {
  await apiPost('/api/v2/knowledge/reindex', {});
  pollReindexStatus();
};
```

2. `pollReindexStatus` (hoje `fetch(\`/api/knowledge/reindex/status?tenantId=${currentTenant?.id}\`)`):
```ts
const pollReindexStatus = () => {
  const interval = setInterval(async () => {
    const data = await apiGet<any>('/api/v2/knowledge/reindex/status');
    setReindexStatus(data);
    if (data.status === 'completed' || data.status === 'not_running') {
      clearInterval(interval);
    }
  }, 2000);
};
```
(Nota: o backend nunca retorna `'not_running'` — só `'running'`/`'completed'` — a condição de parada
continua funcionando porque `'completed'` já cobre o caso. Não precisa mudar essa checagem.)

3. `testSearch` (hoje `fetch('/api/knowledge/search-test', {..., body: JSON.stringify({query: searchQuery, tenantId: currentTenant.id})})`):
```ts
const testSearch = async () => {
  if (!currentTenant?.id || !searchQuery) return;
  const data = await apiPost<any>('/api/v2/knowledge/search-test', { query: searchQuery });
  setSearchResults(data);
};
```

4. `handleReindexArticle` (hoje `fetch(\`/api/knowledge/articles/${id}/reindex\`, {..., body: JSON.stringify({tenantId: currentTenant.id})})`):
```ts
const handleReindexArticle = async (id: string) => {
  if (!currentTenant?.id) return;
  try {
    await apiPost(`/api/v2/knowledge/articles/${id}/reindex`, {});
    fetchKBArticles(currentTenant.id);
  } catch (e: any) {
    toast.error('Erro ao reindexar artigo: ' + (e?.message || 'desconhecido'));
  }
};
```
(Preserve o `try/catch` que já existe no arquivo original — `apiPost` lança `ApiError` em não-2xx,
o `catch` já trata isso igual antes.)

**Bug de badge a corrigir (achado pelo Claude ao investigar):** a tabela de artigos mostra
"Indexado"/"Pendente" checando `article.vector_indexed` — esse campo **não existe** no schema
(sempre `undefined` → badge SEMPRE mostra "Pendente", mesmo pra artigo já indexado). O campo real é
`article.ingest_status` (`'pending'|'indexed'|'failed'`). Corrija:
```tsx
{article.ingest_status === 'indexed' ? (
   <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none"><CheckCircle2 size={12} className="mr-1"/> Indexado</Badge>
) : (
   <Badge variant="secondary" className="text-zinc-500"><RotateCcw size={12} className="mr-1"/> Pendente</Badge>
)}
```
(`fetchKBArticles` já faz `select('*')` direto no Supabase — `ingest_status` já vem junto, não
precisa mudar essa função.)

---

## 5. Verificação mecânica obrigatória

```bash
grep -n "api/knowledge/reindex\|api/knowledge/search-test\|api/knowledge/articles.*reindex" src/pages/KnowledgeBasePage.tsx
```
Só deve aparecer `/api/v2/knowledge/...` — nenhuma ocorrência de `/api/knowledge/` sem `v2`.
```bash
grep -n "vector_indexed" src/pages/KnowledgeBasePage.tsx
```
Deve voltar vazio (campo trocado por `ingest_status`).

## 6. Definition of Done

1. Baseline de typecheck ANTES (`cd apps/api && npx tsc --noEmit 2>&1 | grep -c "error TS"`) e DEPOIS
   — não pode aumentar (baseline conhecido: 56, mas confirme o número de hoje antes de começar).
   `npm run typecheck:legacy` (raiz, frontend) tem que ficar em 0.
2. `npx vitest run apps/api/src/domain/conhecimento/knowledge-reindex.service.test.ts` verde.
3. `npx vitest run apps/api/src/domain/conhecimento/kb-draft.service.test.ts` continua verde (não
   deve quebrar nada vizinho).
4. Verificação mecânica da seção 5 limpa.
5. 1 commit local (`git add` só os arquivos desta lista, nunca `-A`/`.`), sem `git push`.

## 7. Report final obrigatório

Lista exata de arquivos criados/editados, hash do commit, saída colada do typecheck (antes/depois) e
dos testes, qualquer desvio do spec e o motivo.

Se algo aqui conflitar com um impulso seu de "melhorar", o contrato ganha. Fim do contrato.

---

> Escrito pelo Claude em 2026-08-18. Investigação prévia (não refaça): mapeei o pipeline de indexação
> existente, achei o worker nunca-registrado (já corrigido), achei o bug do badge, e reconstitui os
> 4 contratos de request/response lendo o `KnowledgeBasePage.tsx` real (não inventei shape).
