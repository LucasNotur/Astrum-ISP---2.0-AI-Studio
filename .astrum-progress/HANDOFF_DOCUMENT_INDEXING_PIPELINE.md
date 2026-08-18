# HANDOFF — Conserta o pipeline de indexação de documentos (upload PDF/DOCX nunca indexava)

---

## ⛔ CONTRATO DE EXECUÇÃO — LEIA E OBEDEÇA ANTES DE TUDO

Escopo **ESTRITO**. Cumpra à risca.

### 1. Objetivo (contexto, não decisão sua)

`POST /api/v2/documents/upload` (`apps/api/src/domain/ia/documents.routes.ts`) sobe o arquivo pro
R2, grava `knowledge_documents` (`status='processing'`) e publica um evento `document.uploaded` via
`outboxService.publish()`. O outbox poller (já rodando) despacha esse evento pra fila BullMQ
`'documents'` (`apps/api/src/infrastructure/queue/priority-queues.ts:29`). **Bug: NÃO existe, em
lugar nenhum, um Worker que escute essa fila.** Resultado: todo documento enviado fica preso em
`status='processing'` PRA SEMPRE — nunca vira parte do RAG.

Mesmo se o worker existisse, faltaria outra coisa: o payload do evento é só
`{documentId, fileKey, filename}` — sem o TEXTO do arquivo. O pipeline de indexação que já existe
(`packages/queue/src/workers/indexing.worker.ts`, já registrado no boot) só faz chunking+embedding
+upsert Qdrant — ele espera receber `textContent` **já extraído**, não sabe ler PDF/DOCX.

**Sua tarefa: criar o Worker que falta.** Ele escuta `'documents'`, baixa o arquivo do R2, extrai o
texto (PDF/DOCX/TXT/MD), e enfileira no pipeline de indexação que **já existe e já funciona** — sem
duplicar chunking/embedding.

**Já feito pelo Claude (não refaça):**
- `pdf-parse@2.4.5` e `mammoth@1.12.1` **já instalados** em `apps/api/package.json` (commit `44fec21`).
  **NÃO rode `npm install` de novo, não mexa em `package.json`/`package-lock.json`.**
- API dos dois pacotes **verificada contra o código real instalado** (não é achismo — lida do
  `node_modules` + README do pacote):
  - `pdf-parse` v2 é uma classe: `new PDFParse({ data: buffer })`, depois `await parser.getText()`
    → `{ text: string, ... }`, e **precisa** chamar `await parser.destroy()` no fim (libera recursos
    do pdfjs por baixo). NÃO é a API antiga v1 (`pdf(buffer)` função simples) — se você conhece
    pdf-parse de treino anterior, esqueça, a v2 instalada aqui é diferente.
  - `mammoth`: `await mammoth.extractRawText({ buffer })` → `{ value: string, messages: [...] }`.

### 2. Lista EXAUSTIVA de arquivos permitidos

**CRIAR:**
1. `apps/api/src/infrastructure/rag/document-extractor.service.ts`
2. `apps/api/src/infrastructure/rag/document-extractor.service.test.ts`
3. `packages/queue/src/workers/documents.worker.ts`
4. `packages/queue/src/workers/documents.worker.test.ts`

**EDITAR:**
5. `apps/api/src/server.ts` (SÓ registrar o worker novo — mesmo padrão de `createIndexingWorker`)

**NÃO TOCAR:** `package.json`/`package-lock.json` (deps já instaladas), `packages/queue/src/workers/
indexing.worker.ts` (só IMPORTE dele, não edite), `apps/api/src/domain/ia/documents.routes.ts`,
`apps/api/src/infrastructure/queue/outbox.service.ts`, `apps/api/src/infrastructure/queue/priority-
queues.ts`, `apps/api/src/adapters/storage/r2.adapter.ts` (já tem o método `getContent(key)` que
você precisa — só chame, não mude).

**Ações proibidas:** instalar dependências; `git push` (só commit local); `git add -A`/`.`; tocar na
fila `astrum:ai-processing`/`indexing.worker.ts` além de importar `aiProcessingQueue`; inventar um
mecanismo de retry/OCR pra PDF escaneado (fora de escopo — se a extração vier vazia, é `status=
'failed'` com mensagem clara, não um TODO de OCR).

Se o código real divergir do descrito aqui, **PARE e reporte** — não adivinhe.

---

## 3. `document-extractor.service.ts` — implemente exatamente assim

```ts
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

/**
 * Extrai texto puro de um documento pelo file_type já validado no upload
 * (`ALLOWED_TYPES` em documents.routes.ts: pdf, docx, txt, md).
 */
export async function extractText(buffer: Buffer, fileType: string): Promise<string> {
  switch (fileType) {
    case 'pdf': {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text ?? '';
      } finally {
        await parser.destroy();
      }
    }
    case 'docx': {
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? '';
    }
    case 'txt':
    case 'md':
      return buffer.toString('utf-8');
    default:
      throw new Error(`Tipo de arquivo não suportado para extração: ${fileType}`);
  }
}
```

**Teste (`document-extractor.service.test.ts`):** mocke `pdf-parse` e `mammoth` no estilo dos outros
testes do repo (`vi.mock('pdf-parse', () => ({ PDFParse: vi.fn() }))` etc. — confira exemplos de
`vi.mock` de libs externas em qualquer `*.service.test.ts` de `apps/api/src/infrastructure/` pra
pegar o estilo exato usado aqui). Casos a cobrir: `txt`/`md` retornam o buffer decodificado direto
(sem mock, é só `Buffer.from('...', 'utf-8')`); `pdf` chama `getText()` e `destroy()` (confirme que
`destroy()` foi chamado mesmo se `getText()` funcionar — é `finally`); `docx` chama
`extractRawText({buffer})` e retorna `.value`; tipo desconhecido lança erro.

---

## 4. `packages/queue/src/workers/documents.worker.ts` — implemente exatamente assim

Siga o MESMO estilo de import relativo (`../../../../apps/api/src/...`) que `indexing.worker.ts` já
usa no mesmo diretório — abra esse arquivo ao lado como referência de path exato antes de escrever
os imports (os paths abaixo podem estar 1 nível errados, confirme contra o arquivo real):

```ts
import { Worker, type Job } from 'bullmq';
import { connection } from '../../../../apps/api/src/infrastructure/cache/redis.client';
import { setupDLQ } from '../../../../apps/api/src/infrastructure/queue/bullmq.client';
import { addSentryToWorker } from '../../../../apps/api/src/infrastructure/observability/sentry-worker.helper';
import { iaLogger } from '../../../../apps/api/src/infrastructure/logging/logger';
import { supabaseAdmin } from '../../../../apps/api/src/infrastructure/database/supabase.client';
import { r2Adapter } from '../../../../apps/api/src/adapters/storage/r2.adapter';
import { extractText } from '../../../../apps/api/src/infrastructure/rag/document-extractor.service';
import { aiProcessingQueue, type IndexingJobData } from './indexing.worker';

export interface DocumentUploadedJobData {
  documentId: string;
  fileKey: string;
  filename: string;
  tenantId: string;
  outboxId?: string;
}

async function processDocumentUploaded(job: Job<DocumentUploadedJobData>): Promise<void> {
  const { documentId, fileKey, filename, tenantId } = job.data;

  const { data: doc, error } = await supabaseAdmin
    .from('knowledge_documents')
    .select('file_type')
    .eq('id', documentId)
    .single();
  if (error || !doc) {
    throw new Error(`knowledge_documents ${documentId} não encontrado (tenant ${tenantId})`);
  }

  const buffer = await r2Adapter.getContent(fileKey);
  const text = await extractText(buffer, doc.file_type);

  if (!text || !text.trim()) {
    await supabaseAdmin.from('knowledge_documents').update({
      status: 'failed',
      error_message: 'Não foi possível extrair texto do arquivo (vazio, corrompido ou PDF escaneado sem OCR).',
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);
    iaLogger.warn({ tenantId, documentId }, 'Documents worker: extração vazia — marcado failed');
    return;
  }

  const jobData: IndexingJobData = {
    tenantId,
    documentId,
    filename,
    fileType: doc.file_type,
    textContent: text,
    entityType: 'document',
  };
  await aiProcessingQueue.add('index-document', jobData);
  iaLogger.info(
    { tenantId, documentId, chars: text.length },
    'Documents worker: texto extraído, enfileirado pra indexação',
  );
}

export function createDocumentsWorker() {
  const worker = new Worker<DocumentUploadedJobData>('documents', processDocumentUploaded, {
    connection: connection as any,
    concurrency: 2,
  });

  setupDLQ(worker);
  addSentryToWorker(worker, 'documents-worker');

  worker.on('failed', async (job, err) => {
    if (!job) return;
    await supabaseAdmin.from('knowledge_documents').update({
      status: 'failed',
      error_message: err.message,
      updated_at: new Date().toISOString(),
    }).eq('id', job.data.documentId);
  });

  return worker;
}
```

**Por que `entityType: 'document'` e não `'article'`:** `indexing.worker.ts` já distingue os dois
(`IndexingJobData.entityType`) — pra documento ele atualiza `knowledge_documents.status`/
`chunks_count`; pra artigo atualiza `knowledge_articles.ingest_status`. Aqui é sempre documento.

**Por que não usar `getQueueConnection()`:** você pode ver esse nome em docs antigas ou em alguma
worktree — **não existe no `main` hoje** (confirmado pelo Claude lendo o `redis.client.ts` real).
Use `connection` de `redis.client.ts`, exatamente como todo outro worker do repo já faz hoje
(`indexing.worker.ts`, `replay.worker.ts`, etc.) — consistência com o código real, não com um plano
antigo.

**Teste (`documents.worker.test.ts`):** mock de `supabaseAdmin`, `r2Adapter.getContent`,
`extractText`, `aiProcessingQueue.add` — não precisa de Redis/BullMQ real (não teste a conexão em
si, só a função `processDocumentUploaded` isolada, exportando-a também se precisar, ou testando via
um Job fake `{data: {...}} as Job`). Cobrir: caminho feliz (extrai texto, enfileira com
`entityType:'document'`); texto vazio → marca `failed` SEM enfileirar; documento não encontrado →
lança erro (não silencia).

---

## 5. Registro em `server.ts`

Ache o bloco que registra `createIndexingWorker()` (adicionado recentemente, procure por
`indexing-worker`) e adicione logo depois, no MESMO padrão:
```ts
// RAG — Documents worker (consome a fila 'documents' do Outbox; extrai texto PDF/DOCX/TXT/MD
// e enfileira em astrum:ai-processing). Sem isso, upload de documento ficava preso em 'processing'.
// @ts-ignore
const { createDocumentsWorker } = await import('../../../packages/queue/src/workers/documents.worker');
createDocumentsWorker();
app.log.info('[documents-worker] iniciado (fila: documents)');
```

---

## 6. Verificação mecânica obrigatória

```bash
grep -n "createDocumentsWorker" apps/api/src/server.ts
```
Tem que aparecer (import + chamada).
```bash
grep -n "getQueueConnection" packages/queue/src/workers/documents.worker.ts
```
Tem que voltar vazio (ver seção 4 — esse símbolo não existe no main).

## 7. Definition of Done

1. Baseline de typecheck ANTES (`cd apps/api && npx tsc --noEmit 2>&1 | grep -c "error TS"`) e DEPOIS
   — não pode aumentar. Se o `pdf-parse`/`mammoth` derem erro de tipo na importação (ex.: import
   default vs named), ajuste a forma do import conforme o erro real do TS — os tipos já estão
   instalados (`node_modules/pdf-parse/dist/.../index.d.cts`, `node_modules/mammoth/lib/index.d.ts`),
   não precisa adicionar `@types/*`.
2. `npx vitest run apps/api/src/infrastructure/rag/document-extractor.service.test.ts
   packages/queue/src/workers/documents.worker.test.ts` verde (rodar da raiz do repo).
3. Verificação mecânica da seção 6 limpa.
4. 1 commit local (`git add` só os 5 arquivos desta lista, nunca `-A`/`.`), sem `git push`.

## 8. Report final obrigatório

Lista exata de arquivos criados/editados, hash do commit, saída colada do typecheck (antes/depois) e
dos testes, qualquer desvio do spec e o motivo — em especial se a API real de `pdf-parse`/`mammoth`
divergir do que está transcrito na seção 3/4 (o Claude verificou contra o pacote instalado, mas se
o comportamento em runtime for diferente do esperado, reporte em vez de contornar calado).

Se algo aqui conflitar com um impulso seu de "melhorar", o contrato ganha. Fim do contrato.

---

> Escrito pelo Claude em 2026-08-18. Investigação prévia (não refaça): achei que a fila 'documents'
> não tinha consumidor E que faltava extração de texto (2 causas empilhadas do mesmo sintoma).
> Instalei e VERIFIQUEI a API real de `pdf-parse`/`mammoth` contra o pacote instalado (não inventei a
> assinatura) antes de escrever este spec — evita a DeepSeek "alucinar" uma API de treino que pode
> não bater com a versão real instalada aqui.
