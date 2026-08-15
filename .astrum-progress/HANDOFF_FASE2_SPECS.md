# HANDOFF FASE 2 — Specs de execução (para modelo de código)

---

## ⛔ CONTRATO DE EXECUÇÃO — LEIA E OBEDEÇA ANTES DE TUDO

Você foi instruído a "executar este plano passo a passo". O escopo é **ESTRITO**. Cumpra à risca:

1. **EXECUTE APENAS A `SPEC B` (dlq — dead letter queue).** É a única liberada nesta rodada.
   (SPEC A/C/D/E já foram feitas e auditadas; não as refaça.) A SPEC B ficou BLOQUEADA até agora
   porque o Claude precisava verificar a tabela — **já verificou; o schema real está transcrito abaixo.**
2. **NÃO altere nenhum arquivo fora da lista da SPEC B.** Lista EXAUSTIVA de arquivos permitidos:
   - (SPEC B) CRIAR: `apps/api/src/domain/ops/dlq.service.ts`
   - (SPEC B) CRIAR: `apps/api/src/domain/ops/dlq.routes.ts`
   - (SPEC B) CRIAR: `apps/api/src/domain/ops/dlq.service.test.ts`
   - (SPEC B) EDITAR: `apps/api/src/server.ts` (SÓ registrar `dlqRoutes`)
   - (SPEC B) EDITAR: os arquivos de front que chamam `/api/dlq` (ache com grep — ver a SPEC)
   - EDITAR: `.astrum-progress/HANDOFF_FASE2_SPECS.md` (só marcar a SPEC B como feita no fim)
   **NÃO** remova nada do Express (`src/routes/dlq.ts` + mount continuam — o Claude remove por R5
   depois de auditar, pra pegar caller esquecido como no proxy Evolution).
3. **Segurança:** tenant vem do JWT (drop `?tenantId`); gate = super_admin (o legado montava dlq atrás
   de `verifySuperAdmin`); toda query filtra `tenant_id` explícito. Detalhes na SPEC.
4. **AÇÕES PROIBIDAS:** refatorar/"consertar"/reformatar fora do escopo da SPEC B; renomear símbolos;
   mexer em migrations/schema; tocar em webhooks/cobrança/super-admin/evolution; instalar deps;
   `git add -A`/`git add .` (só `git add <os arquivos exatos>`). **NÃO faça `git push`** — commit local.
   O Claude audita antes.
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

## SPEC C — `jobs/schedule-*` — ✅ CONCLUÍDA (2026-08-15)

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

## SPEC D — cobrança: monitor read-only da fila `cobrai` — ✅ CONCLUÍDA (2026-08-15)

**Contexto (verificado pelo Claude):** `src/pages/CobrAIPage.tsx` já chama `GET /api/v2/cobranca/queue-stats`
e `GET /api/v2/cobranca/queue`, mas essas rotas **NÃO existem** no Fastify → hoje dá 404 (o front foi
migrado à frente do backend). Você vai **construí-las**. A fila BullMQ `cobrai` já existe:
```ts
// apps/api/src/infrastructure/queue/priority-queues.ts
export const queues = { cobrai: new Queue('cobrai', ...), /* ... */ };
```
Import a partir de `apps/api/src/domain/cobranca/queue-monitor.routes.ts`:
`import { queues } from '../../infrastructure/queue/priority-queues';` → use `queues.cobrai`.

⚠️ **Você faz SÓ os 2 GET read-only.** `POST send-now` e `DELETE queue/:id` são do Claude (não os crie).

**Segurança (obrigatório):** tenant vem do JWT (`req.user?.tenantId ?? req.user?.tenant_id`), NUNCA de
query/body. A lista de jobs é **filtrada pelo tenant** (um ISP não pode ver job de cobrança de outro).

### Passo 1 — Service PURO (`apps/api/src/domain/cobranca/queue-monitor.service.ts`)
```ts
export interface CobraiJobView { id: string; name: string; data: any; status: string; }

/** Mantém só os jobs do tenant e os mapeia para a view enxuta. Função pura. */
export function filterTenantCobraiJobs(
  rawJobs: Array<{ id?: string; name?: string; data?: any }>,
  tenantId: string,
  stateOf: (job: any) => string,
): CobraiJobView[] {
  return (rawJobs ?? [])
    .filter(j => j?.data?.tenantId === tenantId)
    .map(j => ({ id: String(j.id ?? ''), name: j.name ?? '', data: j.data, status: stateOf(j) }));
}

/** Conta os jobs (já filtrados) por status. Função pura. */
export function countCobraiByStatus(jobs: CobraiJobView[]): Record<string, number> {
  const out: Record<string, number> = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  for (const j of jobs) if (j.status in out) out[j.status] += 1;
  return out;
}
```
- `stateOf` é injetado (a rota passa a função que sabe ler o estado real do job) → o service fica PURO/testável.

### Passo 2 — Teste (`queue-monitor.service.test.ts`) — mínimo 5 casos
- `filterTenantCobraiJobs`: (a) mantém só os do tenant certo; (b) job sem `data.tenantId` é descartado;
  (c) mapeia id/name/status via `stateOf` (passe um stub `() => 'waiting'`).
- `countCobraiByStatus`: (d) conta certo por status; (e) status desconhecido não quebra (ignora).

### Passo 3 — Rotas (`queue-monitor.routes.ts`)
```ts
import type { FastifyInstance } from 'fastify';
import { queues } from '../../infrastructure/queue/priority-queues';
import { filterTenantCobraiJobs, countCobraiByStatus } from './queue-monitor.service';

function tenantOf(req: any): string | undefined { return req.user?.tenantId ?? req.user?.tenant_id; }

const STATES = ['waiting', 'active', 'delayed', 'paused', 'completed', 'failed'] as const;

export async function queueMonitorRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  // Helper local (I/O): busca os jobs do tenant já com o estado real de cada um.
  async function tenantJobs(tenantId: string) {
    let raw: any[] = [];
    try { raw = await (queues.cobrai as any).getJobs([...STATES]); } catch { raw = []; }
    const stateOf = (j: any) => (typeof j?.getState === 'function' ? undefined : (j?.status ?? 'waiting'));
    // getState é async; resolvemos abaixo, então NÃO use stateOf p/ isso — ver nota.
    const withState = await Promise.all(
      (raw ?? []).map(async (j: any) => ({ ...j, __state: await safeState(j) })),
    );
    return filterTenantCobraiJobs(withState, tenantId, (j: any) => j.__state);
  }
  async function safeState(j: any): Promise<string> {
    try { return typeof j?.getState === 'function' ? await j.getState() : (j?.status ?? 'waiting'); }
    catch { return 'waiting'; }
  }

  app.get('/api/v2/cobranca/queue-stats', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const jobs = await tenantJobs(tenantId);
    return reply.send(countCobraiByStatus(jobs));
  });

  app.get('/api/v2/cobranca/queue', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    return reply.send(await tenantJobs(tenantId));
  });
}
```
> Nota: BullMQ expõe o estado via `await job.getState()` (não uma prop síncrona). O helper `safeState`
> trata os dois casos e nunca lança. Se ao abrir o `priority-queues.ts`/tipos do BullMQ algo divergir
> disso (ex.: método diferente), **PARE e reporte** — não invente API.

- Registre `queueMonitorRoutes` em `apps/api/src/server.ts` (import dinâmico + `app.register`, padrão da SPEC A/C).
- **Gate:** só `authenticate` (nível operador — é o dashboard de cobrança do próprio ISP, não super_admin).

### Passo 4 — Front (`src/pages/CobrAIPage.tsx`) — repoint dos 2 GET
- Linha ~106: `const resStats = await fetch('/api/v2/cobranca/queue-stats'); ... setQueueStats(await resStats.json())`
  → `const stats = await apiGet('/api/v2/cobranca/queue-stats'); setQueueStats(stats);` (remova o check de `resStats.ok`/content-type).
- Linha ~118: `const res = await fetch('/api/v2/cobranca/queue'); ... setQueueJobs(await res.json())`
  → `const jobs = await apiGet('/api/v2/cobranca/queue'); setQueueJobs(jobs);`.
- Importe `apiGet` de `@/src/lib/apiClient` se ainda não estiver importado. **NÃO** toque nos outros
  fetch da página (`send-now`, `DELETE queue/:id` — são do Claude) nem nas leituras Supabase.

**Verificação:** `npm run typecheck:legacy` (0) + `cd apps/api && npx tsc --noEmit` (baseline ~56, sem
aumento; `grep domain/cobranca/queue-monitor` = 0 erros novos) + `npx vitest run apps/api/src/domain/cobranca/queue-monitor.service.test.ts`.
**Commit:** `feat(migração): FASE 2-A.4 cobrança monitor read-only (queue-stats + queue v2)`.

---

## SPEC E — repoint do proxy Evolution (5 páginas) — ✅ CONCLUÍDA (2026-08-15)

**Contexto (backend já pronto pelo Claude, commit `d678088`):** o proxy v2 seguro já existe:
- `POST /api/v2/evolution/proxy` — body **só** `{ path, method?, body? }`. As credenciais
  (`evolutionUrl`/`evolutionApiKey`) são resolvidas **server-side** (o cliente NÃO manda mais isso —
  esse é o ganho de segurança: hoje o browser expõe o apiKey no body).
- `GET /api/v2/evolution/fetch-history` → `{ messages: [] }`.

**Sua tarefa:** repontar TODAS as chamadas de `/api/evolution/proxy` e `/api/evolution/fetch-history`
nas 5 páginas para o v2 via `apiClient`, **removendo `evolutionUrl` e `evolutionApiKey` do body**.

**Como achar todos os call sites (não confie em números de linha):**
```
grep -rn "/api/evolution/proxy\|/api/evolution/fetch-history" src/App.tsx src/pages/ChatPage.tsx src/pages/CustomersPage.tsx src/pages/WhatsAppPage.tsx src/pages/ServiceOrdersPage.tsx
```
(Estimativa: App.tsx ~5, WhatsAppPage ~4, ChatPage ~2, CustomersPage ~1, ServiceOrdersPage ~1 — mas
CONFIRME com o grep e reporte a contagem exata por arquivo.)

**Transformação uniforme (aplique em cada site):**

ANTES (padrão típico — pode variar levemente no shape do `body`/response):
```ts
const res = await fetch("/api/evolution/proxy", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    path: `/message/sendText/${evolutionInstance}`,
    method: "POST",
    evolutionUrl,          // ← REMOVER
    evolutionApiKey,       // ← REMOVER
    body: payload,
  }),
});
if (!res.ok) throw new Error(...);      // ← remover: apiPost já lança em erro
const data = await res.json();          // ← apiPost já devolve o JSON parseado
```
DEPOIS:
```ts
const data = await apiPost("/api/v2/evolution/proxy", {
  path: `/message/sendText/${evolutionInstance}`,
  method: "POST",
  body: payload,
});
```
Para `fetch-history`: `const data = await apiGet("/api/v2/evolution/fetch-history");`.

**Regras (importante):**
1. **Remova `evolutionUrl` e `evolutionApiKey`** do objeto enviado — em TODO site. (É o ponto da SPEC.)
2. `apiPost`/`apiGet` (de `@/src/lib/apiClient`) **devolvem o corpo já parseado e lançam em erro** →
   remova os checks `res.ok`/`res.status`/`content-type`/`res.json()`; deixe o `try/catch` existente
   pegar o erro (mantenha o `toast`/tratamento que já existe no `catch`).
3. **Não remova** as variáveis `evolutionUrl`/`evolutionApiKey` das páginas (podem ser usadas em outro
   lugar, ex.: exibição/estado) — só pare de mandá-las no body. Se `npm run typecheck:legacy` acusar
   variável não usada em algum arquivo, **reporte** (não apague por conta própria).
4. Importe `apiPost`/`apiGet` de `@/src/lib/apiClient` no topo de cada página que precisar (se ainda
   não estiver importado). Preserve o `path`/`method`/`body` EXATOS de cada site (não invente rotas).
5. Se algum site tiver um shape diferente do template (ex.: monta o `body` condicionalmente), **preserve
   a lógica** — só troque o transporte (fetch→apiPost) e tire as 2 credenciais. Se ficar em dúvida num
   site específico, **PARE e reporte** esse site em vez de adivinhar.

**Verificação:** `npm run typecheck:legacy` = **0 erros** (é tudo frontend; não precisa rodar apps/api).
Sem teste novo (é repoint de transporte). **Commit:** `feat(migração): FASE 2-A.5 repoint proxy Evolution v2 (creds fora do browser)`.

**REPORT:** liste a contagem EXATA de sites alterados por arquivo + o diff resumido, pra auditoria.

---

## SPEC B — `dlq` (dead letter queue) — ✅ LIBERADA (execute)

**Contexto (verificado pelo Claude via MCP):** a tabela `public.dead_letter_queue` EXISTE. O legado
`src/routes/dlq.ts` usava colunas que NÃO existem (`type`, `retried_at`, `action`) — IGNORE o legado
e use SÓ o schema real abaixo. `payload` é `jsonb` (já é objeto — **sem decode**, diferente do legado
que fazia `decodeDlqPayload`). Front: `MonitoringPage` lista + faz retry (e o `Sidebar` também referencia
`/api/dlq` — ache TODOS com grep, lição do proxy Evolution).

**Schema REAL literal:**
```
dead_letter_queue:
  id uuid PK · job_id text · job_name text · queue_name text · payload jsonb ·
  error_message text · retry_count int · tenant_id uuid · failed_at timestamptz ·
  resolved bool · resolved_at timestamptz · resolved_by uuid · notes text · extra jsonb
```

**Mapa de reenfileiramento (literal):** um job morto volta pra fila certa —
- fila **cobrai**: `import { queues } from '../../infrastructure/queue/priority-queues'` → `queues.cobrai.add(jobName, payload)`.
- fila do **tenant** (default): `import { enqueueMessage } from '../../infrastructure/queue/bullmq.client'` → `enqueueMessage(tenantId, payload, {}, jobName)`.

### Passo 1 — Service PURO (`apps/api/src/domain/ops/dlq.service.ts`)
```ts
export interface DlqRow { queue_name?: string | null; job_name?: string | null; payload?: unknown; tenant_id?: string | null; }
export interface RetryTarget { queue: 'cobrai' | 'tenant'; jobName: string; payload: any; tenantId: string | null; }

/** Decide p/ qual fila o job morto volta. Função pura. */
export function resolveRetryTarget(row: DlqRow): RetryTarget {
  const isCobrai = row.queue_name === 'cobrai' || (row.job_name ?? '').toLowerCase().includes('cobrai');
  return {
    queue: isCobrai ? 'cobrai' : 'tenant',
    jobName: row.job_name || 'process-message',
    payload: (row.payload ?? {}) as any,
    tenantId: row.tenant_id ?? null,
  };
}
```

### Passo 2 — Teste (`dlq.service.test.ts`) — mínimo 4 casos
(a) `queue_name==='cobrai'` → queue 'cobrai'; (b) `job_name` contém "cobrai" → 'cobrai';
(c) senão → 'tenant'; (d) defaults: sem job_name → 'process-message', sem payload → `{}`.

### Passo 3 — Rotas (`dlq.routes.ts`)
```ts
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { queues } from '../../infrastructure/queue/priority-queues';
import { enqueueMessage } from '../../infrastructure/queue/bullmq.client';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { resolveRetryTarget } from './dlq.service';

function tenantOf(req: any): string | undefined { return req.user?.tenantId ?? req.user?.tenant_id; }

export async function dlqRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];
  // super_admin-only (paridade com o verifySuperAdmin do legado). reports:admin só o super_admin tem.
  const admin = [requirePermission('reports', 'admin')];

  // GET /api/v2/dlq → jobs mortos não resolvidos do tenant.
  app.get('/api/v2/dlq', { onRequest: auth, preHandler: admin }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { data, error } = await supabaseAdmin
      .from('dead_letter_queue')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('resolved', false)
      .order('failed_at', { ascending: false });
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });

  // POST /api/v2/dlq/:id/retry → reenfileira + marca resolvido.
  app.post('/api/v2/dlq/:id/retry', { onRequest: auth, preHandler: admin }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { id } = req.params as { id: string };

    const { data: row } = await supabaseAdmin
      .from('dead_letter_queue').select('*')
      .eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (!row) return reply.code(404).send({ code: 'NOT_FOUND' });

    const t = resolveRetryTarget(row);
    if (t.queue === 'cobrai') await (queues.cobrai as any).add(t.jobName, t.payload);
    else await enqueueMessage(t.tenantId ?? tenantId, t.payload, {}, t.jobName);

    const userId = (req as any).user?.userId ?? (req as any).user?.sub ?? null;
    await supabaseAdmin.from('dead_letter_queue')
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: userId })
      .eq('id', id).eq('tenant_id', tenantId);

    return reply.send({ ok: true });
  });
}
```
Registre `dlqRoutes` em `apps/api/src/server.ts` (import dinâmico + `app.register`, padrão das outras).

### Passo 4 — Front: repoint de TODOS os callers de `/api/dlq`
```
grep -rn "/api/dlq" src --include=*.ts --include=*.tsx
```
Para cada: `fetch('/api/dlq?tenantId=…')` → `apiGet('/api/v2/dlq')` (drop tenantId);
`fetch('/api/dlq/'+id+'/retry',{method:'POST'})` → `apiPost('/api/v2/dlq/'+id+'/retry', {})`.
Remova checks `res.ok`/`content-type`/`res.json()` (apiGet/apiPost devolvem parseado e lançam em erro;
deixe o `catch`/`toast` existente tratar). Importe `apiGet`/`apiPost` de `@/src/lib/apiClient`.
**Reporte a lista EXATA de arquivos/sites de front que você alterou.**

**Verificação:** `npm run typecheck:legacy` (0) + `cd apps/api && npx tsc --noEmit` (baseline ~56,
`grep domain/ops/dlq` = 0 novos) + `npx vitest run apps/api/src/domain/ops/dlq.service.test.ts`.
**Commit:** `feat(migração): FASE 2-A(dlq) port dead-letter-queue v2 (retry engine-aware)`.

---

## Ao terminar
Abra a lista de arquivos que você criou/alterou e o commit. O Claude vai **auditar**: correção do
contrato, ausência de `fetch` cru/`tenantId` de body, presença/qualidade do teste, typecheck, e se
algo fora do escopo escapou. Deixe as ressalvas explícitas no report (ex.: o gate de role de
queues/stats que ficou pro Claude).
