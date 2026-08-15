# HANDOFF FASE 2 — Specs de execução (para modelo de código)

---

## ⛔ CONTRATO DE EXECUÇÃO — LEIA E OBEDEÇA ANTES DE TUDO

Você foi instruído a "executar este plano passo a passo". O escopo é **ESTRITO**. Cumpra à risca:

1. **EXECUTE APENAS A `SPEC A` (queues/stats).** É a única liberada nesta rodada.
2. **NÃO EXECUTE A `SPEC B` (dlq).** Está **BLOQUEADA** — depende de o Claude verificar a tabela
   `dead_letter_queue` no Supabase e transcrever o schema real aqui. Está no doc só como contexto.
   Se achar que "deveria" construí-la, **PARE** e escreva no report — **não escreva uma linha dela.**
3. **NÃO altere nenhum arquivo fora da lista da SPEC A.** Lista EXAUSTIVA de arquivos permitidos:
   - (SPEC A) CRIAR: `apps/api/src/domain/ops/queues.service.ts`
   - (SPEC A) CRIAR: `apps/api/src/domain/ops/queues.routes.ts`
   - (SPEC A) CRIAR: `apps/api/src/domain/ops/queues.service.test.ts`
   - (SPEC A) EDITAR: `apps/api/src/server.ts` (só adicionar o registro da rota)
   - (SPEC A) EDITAR: `src/pages/MonitoringPage.tsx` (só o fetch de `/api/queues/stats`)
   - EDITAR: `.astrum-progress/HANDOFF_FASE2_SPECS.md` (só marcar a SPEC A como feita no fim)
   Qualquer outro arquivo → **NÃO TOQUE.** Em especial: **NÃO** remova nada do Express
   (`server.ts` raiz, `src/routes/*`) — a remoção do legado é do Claude (R5, após auditoria).
4. **AÇÕES PROIBIDAS:** refatorar/"consertar"/reformatar código fora do escopo da SPEC A; renomear
   símbolos; mexer em migrations/schema; tocar em webhooks, cobrai, super-admin, evolution, jobs,
   `os`, ou qualquer `src/routes/*`; instalar dependências novas; `git add -A`/`git add .` (só
   `git add <os arquivos exatos da lista>`). **NÃO faça `git push`** — deixe o commit local. O Claude
   audita ANTES de subir pro main.
5. **Se o código real divergir deste spec** (um símbolo que não existe, um shape diferente, um import
   que não resolve): **PARE e reporte** — não adivinhe, não "conserte" por conta própria.
6. **DEFINITION OF DONE (há um BASELINE pré-existente — leia com atenção):**
   - **Frontend (MonitoringPage):** `npm run typecheck:legacy` na raiz tem de ficar **100% limpo (0 erros)**.
   - **Backend (apps/api):** ⚠️ `cd apps/api && npx tsc --noEmit` **JÁ tem ~56 erros PRÉ-EXISTENTES**
     em 22 arquivos SEM relação com queues (workers, `url-guard.ts`, `geo-location.service.ts`, vários
     `domain/*/*.service.ts`). Isso é dívida de outras sessões — **NÃO é seu trabalho, NÃO TOQUE.**
     Seu critério: os SEUS arquivos novos têm **0 erros** — confira com
     `cd apps/api && npx tsc --noEmit 2>&1 | grep domain/ops` (tem que sair **vazio**) e o total de
     `error TS` **não pode aumentar** além do baseline (~56).
   - Teste da SPEC A verde: `npx vitest run apps/api/src/domain/ops/queues.service.test.ts` (da raiz).
   - **1 commit**, só com os arquivos da SPEC A.
7. **REPORT FINAL OBRIGATÓRIO** (para a auditoria do Claude) — ao terminar, imprima:
   - a lista EXATA de arquivos criados/editados;
   - o hash do commit;
   - a saída dos 2 typechecks e do teste (colada, não resumida);
   - quaisquer desvios do spec e o motivo.

Se qualquer passo acima conflitar com um impulso seu de "melhorar" algo, o contrato ganha. Fim do contrato.

---

> Escrito pelo Claude (Opus 4.8) em 2026-08-15. Divisão de trabalho (Fase 2, modo híbrido):
> **DB/segurança/cutover/decisão/auditoria = Claude aqui;** **código puro/mecânico = você.**
> Você NÃO tem acesso ao Supabase nem ao Redis: não consulte banco/fila. Tudo que precisa está
> **transcrito literalmente** abaixo. Se algo divergir do real, **PARE e reporte** — não invente.

## 0. Como raciocinar (leia antes de tocar em código)

1. **Verifique antes de construir.** Abra o arquivo real, confirme o shape, confirme que os símbolos
   que você importa existem. Se o código real contradisser o spec, o código real ganha — reporte.
2. **Service PURO + testável.** A lógica vai num `*.service.ts` de funções puras (sem I/O), com teste
   Vitest do COMPORTAMENTO. A rota Fastify só faz auth + I/O + chama o service. Obrigatório (CLAUDE.md).
3. **Front usa o cliente central** `@/src/lib/apiClient` (`apiGet/...`) — nunca `fetch()` cru.
4. **Verifique no fim:** `npm run typecheck:legacy` (raiz) **e** `cd apps/api && npx tsc --noEmit`.
   Rode o teste **da raiz do repo** (a config do vitest está na raiz).
5. **Commit em fatia limpa.** Revise o diff INTEIRO de `MonitoringPage.tsx` antes do `git add`
   (outras sessões deixam carona). `git add <arquivos exatos>`, nunca `-A`. Termine a mensagem com
   `Co-Authored-By: <seu-modelo>`.

### Padrão de rota Fastify (copie esta forma)
```ts
import type { FastifyInstance } from 'fastify';

export async function queuesRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.get('/api/v2/queues/stats', { onRequest: auth }, async (req, reply) => {
    // ... I/O + chama o service puro, retorna
  });
}
```
Registre em `apps/api/src/server.ts` (procure o bloco de `await app.register(...)` e adicione a sua
logo após uma rota de domínio parecida, no mesmo estilo `const { X } = await import('./domain/...'); await app.register(X);`).

---

## SPEC A — `queues/stats` — ✅ LIBERADA (execute)

**Problema que você resolve:** `src/pages/MonitoringPage.tsx` (~linha 63) chama `fetch('/api/queues/stats')`
(rota Express legada, gated por super-admin). Vamos expor o equivalente no Fastify e repontar o front.

**Fato literal do backend (JÁ EXISTE — não crie, só importe):** o arquivo
`apps/api/src/infrastructure/queue/bullmq.client.ts` exporta:
```ts
export const messageQueue = /* Queue "message-processing" | mock */;
// messageQueue.getJobCounts('waiting','active','completed','failed','delayed')
//   → resolve p/ um objeto { waiting, active, completed, failed, delayed } de números.
//   ⚠️ No modo mock (sem Redis real) resolve p/ {} — por isso normalize com default 0.
```
Import a partir de `apps/api/src/domain/ops/queues.routes.ts` (2 níveis abaixo de `src`):
`import { messageQueue } from '../../infrastructure/queue/bullmq.client';`

**Passo 1 — Service puro (`apps/api/src/domain/ops/queues.service.ts`):**
- `export interface QueueCounts { waiting: number; active: number; completed: number; failed: number; delayed: number; }`
- `export function normalizeQueueCounts(raw: Record<string, number> | null | undefined): QueueCounts`
  → devolve os 5 campos, cada um `= Number(raw?.[k]) || 0` (trata `{}`, `undefined`, `null`, NaN → 0).
  Função **pura**, sem I/O.

**Passo 2 — Teste (`apps/api/src/domain/ops/queues.service.test.ts`):** mínimo 5 casos do
`normalizeQueueCounts`: (a) objeto completo preserva; (b) `{}` → tudo 0; (c) `undefined` → tudo 0;
(d) parcial (`{waiting:3}`) → resto 0; (e) valor não-numérico/`NaN` → 0. Use `describe/it/expect` (Vitest).

**Passo 3 — Rota (`apps/api/src/domain/ops/queues.routes.ts`):**
- `GET /api/v2/queues/stats`, `onRequest: auth` (padrão acima).
- Chama `const raw = await (messageQueue as any).getJobCounts('waiting','active','completed','failed','delayed');`
  (envolva em `try/catch`: em erro, use `{}`), depois `return reply.send(normalizeQueueCounts(raw));`.
- **Nota de gate (deixe explícito no report):** o legado exigia `super_admin`. Você só coloca
  `authenticate` (JWT). O **Claude adiciona o gate de role na auditoria** — NÃO tente adivinhar o
  sistema de permissão do Fastify.

**Passo 4 — Registrar** `queuesRoutes` em `apps/api/src/server.ts` (import dinâmico + `app.register`).

**Passo 5 — Front (`src/pages/MonitoringPage.tsx`, ~linha 63):** troque o `fetch('/api/queues/stats')`
por `apiGet('/api/v2/queues/stats')` (importe `apiGet` de `@/src/lib/apiClient` se não estiver importado).
O shape de resposta é idêntico (`{waiting,active,completed,failed,delayed}`) — **não mude o render.**

**Verificação:** os 2 typechecks (regra do DoD) + `npx vitest run apps/api/src/domain/ops/queues.service.test.ts`.
**Commit:** `feat(migração): BUILD queues/stats v2 (Fase 2, port do Express)`.

---

## SPEC B — `dlq` — 🚫 NÃO EXECUTAR (bloqueada; o Claude preenche o schema)

**Por que está bloqueada:** a rota lê a tabela Supabase `dead_letter_queue` e **reenfileira** o job
na fila certa (`cobrai` vs fila do tenant). Você não tem acesso ao Supabase pra confirmar as colunas
reais, nem ao mapa de filas do motor novo. Construir no escuro = código fraco/quebrado.

**O que falta (tarefa do Claude, antes de liberar):** verificar via MCP a existência e o schema da
tabela `dead_letter_queue`, transcrever aqui as colunas literais (`tenant_id`, `resolved`, `payload`,
`type`, `queue_name`, ...), e o mapa de reenfileiramento literal (`priority-queues.ts` fila `cobrai`
vs `getTenantQueue(tenantId)` de `bullmq.client.ts`). Só então esta SPEC vira "LIBERADA".

→ **NÃO escreva código de dlq.** Está aqui só como registro do próximo passo.

---

## Ao terminar
Abra a lista de arquivos que você criou/alterou e o commit. O Claude vai **auditar**: correção do
contrato, ausência de `fetch` cru/`tenantId` de body, presença/qualidade do teste, typecheck, e se
algo fora do escopo escapou. Deixe as ressalvas explícitas no report (ex.: o gate de role de
queues/stats que ficou pro Claude).
