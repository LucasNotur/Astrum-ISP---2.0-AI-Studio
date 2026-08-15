# HANDOFF FASE 2 — Specs de execução (para modelo de código)

---

## ⛔ CONTRATO DE EXECUÇÃO — LEIA E OBEDEÇA ANTES DE TUDO

Você foi instruído a "executar este plano passo a passo". O escopo é **ESTRITO**. Cumpra à risca:

1. **EXECUTE APENAS A `SPEC C` (jobs/schedule-*).** É a única liberada nesta rodada. (A `SPEC A`
   queues/stats já foi feita e auditada; não a refaça.)
2. **NÃO EXECUTE A `SPEC B` (dlq).** Está **BLOQUEADA** — depende de o Claude verificar a tabela
   `dead_letter_queue` no Supabase e transcrever o schema real aqui. Se achar que "deveria"
   construí-la, **PARE** e escreva no report — **não escreva uma linha dela.**
3. **NÃO altere nenhum arquivo fora da lista da SPEC C.** Lista EXAUSTIVA de arquivos permitidos:
   - (SPEC C) EDITAR: `src/workers/messageWorker.ts` (SÓ o bloco CSAT ~linha 869)
   - (SPEC C) EDITAR: `src/lib/gemini.server.ts` (SÓ o bloco SLA ~linha 4254)
   - (SPEC C) CRIAR: `apps/api/src/domain/ops/jobs.service.ts`
   - (SPEC C) CRIAR: `apps/api/src/domain/ops/jobs.routes.ts`
   - (SPEC C) CRIAR: `apps/api/src/domain/ops/jobs.service.test.ts`
   - (SPEC C) EDITAR: `apps/api/src/server.ts` (SÓ registrar `jobsRoutes`)
   - (SPEC C) EDITAR: `src/lib/db.ts` (SÓ o bloco CSAT ~linha 177)
   - (SPEC C) REMOVER: `src/routes/jobs.ts`
   - (SPEC C) EDITAR: `server.ts` (raiz) — SÓ remover o import `jobsRouter` + o mount `/api/jobs`
   - EDITAR: `.astrum-progress/HANDOFF_FASE2_SPECS.md` (só marcar a SPEC C como feita no fim)
   Qualquer outro arquivo → **NÃO TOQUE.**
   ⚠️ **Exceção autorizada à regra geral:** NESTA spec você PODE remover a rota Express `jobs`
   (`src/routes/jobs.ts` + mount no `server.ts` raiz) — porque os callers dela estão sendo migrados
   no mesmo commit. NÃO toque em NENHUMA outra rota Express (`superAdmin`, `cobrai`, `dlq`, `evolution`,
   webhooks continuam intactas).
4. **AÇÕES PROIBIDAS:** refatorar/"consertar"/reformatar código fora do escopo da SPEC C; renomear
   símbolos; mexer em migrations/schema; tocar em webhooks, cobrai, super-admin, evolution, ou qualquer
   `src/routes/*` que NÃO seja `jobs.ts`; instalar dependências novas; `git add -A`/`git add .` (só
   `git add <os arquivos exatos da lista>`). **NÃO faça `git push`** — deixe o commit local. O Claude
   audita ANTES de subir pro main. ⚠️ `messageWorker.ts` e `gemini.server.ts` são arquivos GRANDES e
   SENSÍVEIS (motor de atendimento): mexa **só no bloco exato** transcrito, nada mais.
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

## SPEC A — `queues/stats` — ✅ CONCLUÍDA (2026-08-15)

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

## SPEC C — `jobs/schedule-*` — ✅ LIBERADA (execute)

**Objetivo:** aposentar a rota Express `/api/jobs/*`. Ela existe só pra agendar jobs atrasados
(`send_csat`, `sla_warning`). Verificado pelo Claude: a fila `messages-${tenantId}` é a MESMA no
legado (`src/lib/queue.ts`) e no Fastify (`bullmq.client`) → um job enfileirado por qualquer lado é
consumido pelo worker legado. `schedule-pos-install` **não tem caller** → morre com a rota.

**Regra de ouro (o motivo do desenho):** código **server-side** (worker/gemini.server) chama
`enqueueMessage` **direto** (elimina o hop HTTP). Código **browser** (`db.ts`, roda no navegador,
NÃO alcança Redis) chama uma **rota v2 nova**. Não misture.

`enqueueMessage` (assinatura idêntica nos dois lados):
`enqueueMessage(tenantId: string, payload: any, opts?: {delay?: number}, jobName?: string)`.

### Passo 1 — `src/workers/messageWorker.ts` (SERVER, ~linha 869) — enqueue direto
Troque EXATAMENTE este bloco:
```ts
            fetch("http://localhost:3000/api/jobs/schedule-csat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ticketId: docSnap.id,
                tenantId: tDocData.tenantId,
                customerId,
                category: tDocData.session_state?.agent || 'SAC_GERAL',
                resolved_by: tDocData.human_responded ? 'human' : 'bot'
              })
            }).catch((e: any) => logger.error("csat_schedule_failed", { ...logCtx, error: e.message }));
```
por:
```ts
            try {
              const { enqueueMessage } = await import("../lib/queue");
              await enqueueMessage(
                tDocData.tenantId || "default",
                {
                  ticketId: docSnap.id,
                  tenantId: tDocData.tenantId || "default",
                  customerId,
                  category: tDocData.session_state?.agent || 'SAC_GERAL',
                  resolved_by: tDocData.human_responded ? 'human' : 'bot',
                },
                { delay: 60 * 1000 },
                "send_csat",
              );
            } catch (e: any) { logger.error("csat_schedule_failed", { ...logCtx, error: e.message }); }
```
(o `import` dinâmico de `../lib/queue` é o padrão JÁ usado nesse arquivo — ex.: linhas 315, 381, 613.)

### Passo 2 — `src/lib/gemini.server.ts` (SERVER, ~linha 4254) — 2 enqueues diretos
Troque EXATAMENTE este bloco:
```ts
      fetch("/api/jobs/schedule-sla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, tenantId, customerId }),
      }).catch((e: any) =>
        logger.error("error_call_sla_api", { error: e?.message || String(e) }),
      );
```
por (o legado agendava DOIS avisos: nível 1 em 10min, nível 2 em 15min):
```ts
      try {
        const { enqueueMessage } = await import("./queue");
        const t = tenantId || "default";
        await enqueueMessage(t, { ticketId, tenantId: t, customerId, level: 1 }, { delay: 10 * 60 * 1000 }, "sla_warning");
        await enqueueMessage(t, { ticketId, tenantId: t, customerId, level: 2 }, { delay: 15 * 60 * 1000 }, "sla_warning");
      } catch (e: any) {
        logger.error("error_call_sla_api", { error: e?.message || String(e) });
      }
```

### Passo 3 — Rota v2 nova (para o caller BROWSER)
- CRIAR `apps/api/src/domain/ops/jobs.service.ts` (função PURA):
  ```ts
  export interface CsatJob { tenantId: string; payload: Record<string, unknown>; delayMs: number; jobName: 'send_csat'; }
  export class JobValidationError extends Error {}
  export function buildCsatJob(body: any, tenantId: string): CsatJob {
    if (!tenantId) throw new JobValidationError('tenant ausente');
    if (!body?.ticketId) throw new JobValidationError('ticketId obrigatório');
    return {
      tenantId,
      payload: {
        ticketId: String(body.ticketId),
        tenantId,
        customerId: body.customerId ?? null,
        category: body.category ?? 'SAC_GERAL',
        resolved_by: body.resolved_by === 'human' ? 'human' : 'bot',
      },
      delayMs: 60 * 1000,
      jobName: 'send_csat',
    };
  }
  ```
- CRIAR `apps/api/src/domain/ops/jobs.service.test.ts` — mínimo 4 casos de `buildCsatJob`: (a) ok
  monta payload com tenant do arg; (b) sem `ticketId` → lança `JobValidationError`; (c) sem tenant →
  lança; (d) `resolved_by` diferente de 'human' vira 'bot'.
- CRIAR `apps/api/src/domain/ops/jobs.routes.ts`:
  ```ts
  import type { FastifyInstance } from 'fastify';
  import { enqueueMessage } from '../../infrastructure/queue/bullmq.client';
  import { buildCsatJob, JobValidationError } from './jobs.service';

  function tenantOf(req: any): string | undefined { return req.user?.tenantId ?? req.user?.tenant_id; }

  export async function jobsRoutes(app: FastifyInstance) {
    const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];
    // Gate: SÓ authenticate (nível operador). Resolver ticket é ação de operador, não super_admin.
    app.post('/api/v2/jobs/schedule-csat', { onRequest: auth }, async (req, reply) => {
      const tenantId = tenantOf(req);
      if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
      try {
        const job = buildCsatJob(req.body, tenantId);
        await enqueueMessage(job.tenantId, job.payload, { delay: job.delayMs }, job.jobName);
        return reply.send({ success: true });
      } catch (e) {
        if (e instanceof JobValidationError) return reply.code(400).send({ code: 'BAD_REQUEST', message: e.message });
        return reply.code(500).send({ code: 'INTERNAL' });
      }
    });
  }
  ```
- EDITAR `apps/api/src/server.ts`: registrar `jobsRoutes` (mesmo padrão de import dinâmico da SPEC A:
  `const { jobsRoutes } = await import('./domain/ops/jobs.routes'); await app.register(jobsRoutes);`).

### Passo 4 — `src/lib/db.ts` (BROWSER, ~linha 177) — repoint p/ a rota v2
Troque EXATAMENTE este bloco:
```ts
        fetch("/api/jobs/schedule-csat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketId,
            tenantId: tData.tenant_id || "default",
            customerId: tData.customer_id,
            category: tData.session_state?.agent || "SAC_GERAL",
            resolved_by: tData.human_responded ? "human" : "bot",
          }),
        }).catch(e => console.error("Falha ao agendar CSAT:", e));
```
por (dropa o `tenantId` — vem do JWT):
```ts
        apiPost("/api/v2/jobs/schedule-csat", {
          ticketId,
          customerId: tData.customer_id,
          category: tData.session_state?.agent || "SAC_GERAL",
          resolved_by: tData.human_responded ? "human" : "bot",
        }).catch(e => console.error("Falha ao agendar CSAT:", e));
```
Importe `apiPost` de `@/src/lib/apiClient` no topo do `db.ts` se ainda não estiver importado.

### Passo 5 — Remover a rota Express `jobs`
- REMOVER o arquivo `src/routes/jobs.ts`.
- EDITAR `server.ts` (raiz): remover a linha `import { jobsRouter } from "./src/routes/jobs.ts";`
  e a linha `app.use("/api/jobs", verifySuperAdmin, jobsRouter);`. **NÃO** remova nenhuma outra linha.

**Verificação:** `npm run typecheck:legacy` (0 erros) + `cd apps/api && npx tsc --noEmit` (baseline ~56,
não aumentar; `grep domain/ops` = 0 erros novos) + `npx vitest run apps/api/src/domain/ops/jobs.service.test.ts`.
**Commit:** `feat(migração): FASE 2-A.3 jobs/schedule-* (drop hop HTTP + rota csat v2)`.

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
