# PLANO FASE 2 — Portar rotas Express legadas → Fastify `/api/v2` (R5)

> Criado 2026-08-15 (Claude Opus 4.8), início da Fase 2. Continuação de
> `PLANO_MIGRACAO_EXPRESS_FASTIFY.md` (§Fase 2). Respeita R4 (lógica nova em `apps/api`),
> R5 (portar+validar com teste, SÓ então remover do Express), R6 (uma engine CobrAI).
> Modo de trabalho: **híbrido** — Claude faz DB/segurança/cutover/decisão/auditoria;
> modelo externo (GLM/DeepSeek) faz só código **puro/mecânico** com schema literal.
> O handoff blindado pro modelo externo vive em `HANDOFF_FASE2_SPECS.md`.

## 🔄 PONTO DE RETOMADA

Fase 1 ✅ concluída (todos os BUILDs + backlog de produto). Único pendente antigo = **VoIP**
(bloqueado no trunk SIP; Claude faz quando houver credenciais). **Agora = Fase 2.**

**Estado atual:** planejamento feito (este doc). Nada da Fase 2 codado ainda.
**Próximo passo:** começar a **Fase 2-A** (Claude, ordem abaixo) e liberar a **SPEC A** do handoff
(`queues/stats`) pro modelo externo em paralelo (não depende de nada do Claude).

---

## 1. Triagem — o que cada rota legada realmente é

Levantado lendo o código real (`src/routes/*` + `server.ts` + `apps/api/src`), não pelo nome.
**Achado central:** a Fase 2 **não é port mecânico**. Metade das rotas ou (a) já tem equivalente
v2, ou (b) lê coleções `db-compat` que precisam remapear pra tabelas Supabase reais, ou (c) é
segurança de webhook (HMAC raw-body) / cutover S74 / R6. Só 2 rotas são "código puro".

| Rota legada (mount) | O que é de fato | v2 já existe? | Dono |
|---|---|---|---|
| `webhook/evolution` | HMAC raw-body + `enqueueMessage` + shadow S74 + lookup tenant por instância | ✅ `atendimento/evolution-webhook.routes.ts` (shadow, S71) | **Claude** — é **cutover** (`ATENDIMENTO_ENGINE`), não build |
| `webhook/facebook` | Messenger Pages; HMAC; lookup tenant por `page_id`; enfileira | ~ `adapters/meta/meta-webhook.routes.ts` (falta migration `tenant_meta_pages`) | **Claude** — DB + segurança |
| `webhook/asaas` | pagamento + lockout de inadimplente; timing-safe (`src/lib/billing.ts`) | ❌ | **Claude** — financeiro + segurança |
| `super-admin/*` | `ai-circuit`,`tenants`,`tenants/:id`,`suspend`,`reactivate`,`metrics`(MRR/churn),`custom-domains` — lê `tenants`/`saas_metrics`/`audit_logs`/`custom_domains` via db-compat | ❌ | **Claude** — remap Supabase real + superfície privilegiada (role `super_admin`) |
| `cobrai/*` | `queue-stats`,`queue`,`send-now` — BullMQ `cobrai` + `customers` (db-compat) | fila `cobrai` existe em `priority-queues.ts` | **Claude** — R6 (COBRAI_ENGINE), decidido **portar tudo agora** |
| `evolution/proxy` | proxy p/ Evolution API com `evolutionUrl`+`apiKey` **vindos do browser** (segredo + SSRF) | ❌ | **Claude** — mover creds p/ server-side + guard SSRF (contrato); repoint de 5 páginas é mecânico |
| `jobs/schedule-*` | `pos-install`/`csat`/`sla` — chamados por **workers/server-side** (`db.ts`, `messageWorker.ts`, `gemini.server.ts`), **sem JWT** | `enqueueMessage` existe em `bullmq.client.ts` | **Claude** — decidir desenho (chamar `enqueueMessage` direto vs rota interna com token) |
| `/api/ai/ask` (`gemini.ts`) | teste de agente + simulação IA no chat; contrato ≠ do `/api/v2/chat/stream` | v2 tem `chat-stream` (SSE, contrato ≠) | **Claude** — cutover S74, integração real |
| `queues/stats` | contadores BullMQ da fila de mensagens | `messageQueue.getJobCounts` em `bullmq.client.ts` | **Modelo externo** ✅ (puro) → **SPEC A** |
| `dlq` | lista `dead_letter_queue` (Supabase) + reenfileira | tabela precisa ser verificada pelo Claude | **Modelo externo** com schema literal → **SPEC B** (após Claude verificar a tabela) |
| `os/optimize-route` + `checkins` + `supervisor/list` | `optimize-route` = TSP puro; `checkins`/`supervisor` leem `dbMock` em memória (nunca populado, só um teste usa) | ✅✅ **`POST /api/v2/field/route/optimize`** (2-opt, superior) já existe | **Claude** — **REMOVER legado morto** (v2 já cobre); não portar |

## 2. Divisão de trabalho (modo híbrido)

### FASE 2-A — Claude faz aqui (DB / segurança / cutover / R6 / decisão)
Ordem recomendada (menor risco → maior; cada item = portar+testar, e SÓ então remover do Express):

1. **`os` cleanup** *(rápido, baixo risco)* — remover `src/routes/osRouting.ts` + o mount + o teste
   `src/__tests__/routes/osRouting.test.ts`. Justificativa: `POST /api/v2/field/route/optimize` já
   cobre (algoritmo superior), nenhuma UI chama o legado (só o teste). Verificar cobertura antes de rm.
2. **`super-admin`** — criar `apps/api/src/domain/provedor/super-admin.routes.ts` + service.
   Remapear: `tenants` (tabela real), `metrics` (MRR/churn — decidir fonte: portar `saasMetrics` ou
   recomputar de `tenants`/`subscriptions`), `ai-circuit` (Redis `llm_circuit:*` + `audit_log`),
   `custom-domains` (tabela real ou dropar). Gate `role==='super_admin'`. Repoint SuperAdminPage +
   AIObservabilityPage via `apiClient`.
3. **`jobs`** — DECISÃO de desenho primeiro: os callers são server-side (worker) sem JWT. Melhor
   caminho = os workers chamarem `enqueueMessage(...)` **direto** (sem HTTP), eliminando a rota. Se
   precisar de rota (algum caller externo), expor `/api/v2/jobs/*` com token interno. Migrar os 3
   call sites (`src/lib/db.ts`, `src/lib/gemini.server.ts`, `src/workers/messageWorker.ts`).
4. **`cobrai`** *(R6 — portar tudo agora, decisão do dono)* — `/api/v2/cobrai/queue-stats|queue|send-now`
   sobre a fila `cobrai` (`priority-queues.ts`) + `customers` (Supabase real). ⚠️ Garantir que **só uma
   engine** consome a fila (respeitar `COBRAI_ENGINE`; não ligar cutover por si só). `send-now` lê
   inadimplentes → precisa das colunas reais de `customers` (`financial_status`,`overdue_days`).
5. **`evolution/proxy`** — construir `/api/v2/evolution/proxy` **seguro**: buscar `evolutionUrl`+`apiKey`
   do tenant **server-side** (`tenant_evolution_instances`/`integration_keys`), **não do body**; guard
   anti-SSRF (bloquear IP privado/loopback/metadata) + timeout + teto. Depois repoint mecânico das 5
   páginas (App, ChatPage, CustomersPage, WhatsAppPage, ServiceOrdersPage) → candidato a handoff externo.
6. **Webhooks** *(mais sensível, por último)*:
   - `webhook/evolution` — paridade de HMAC já validada (v2 existe como shadow); é **flip do cutover**
     `ATENDIMENTO_ENGINE=v2` quando o motor novo estiver pronto (S74). Não é build.
   - `webhook/facebook` — migration `tenant_meta_pages` (Claude, via MCP) + garantir paridade HMAC
     raw-body/fail-closed no `meta-webhook.routes.ts`; apontar o provider pro `/api/v2/webhook/meta`.
   - `webhook/asaas` — portar `asaasWebhookHandler` p/ `/api/v2/webhook/asaas` com HMAC timing-safe
     fail-closed + reusar o job `lockout_tenant`. Financeiro: cuidado redobrado + teste.
7. **`/api/ai/ask`** — integração real com `/api/v2/chat/stream` (contrato history+session_state →
   category/shouldEscalate). Cruza cutover S74. Fica por último (depende do desenho de atendimento v2).

### FASE 2-B — Modelo externo (handoff blindado, código puro) → `HANDOFF_FASE2_SPECS.md`
- **SPEC A — `queues/stats`** ✅ pronta pra liberar já (self-contained, sem Supabase, import literal).
- **SPEC B — `dlq`** — liberar **após** Claude verificar a tabela `dead_letter_queue` no Supabase e
  transcrever o schema + o mapa de reenfileiramento (fila `cobrai` vs `getTenantQueue`) literalmente.
- **Repoints mecânicos** (rodadas futuras) — as 5 páginas do `evolution/proxy` e a SuperAdminPage,
  **depois** que o backend Claude correspondente estiver no ar (contrato literal no spec).

## 3. Definition of Done (por rota portada)
- Service **puro** (`*.service.ts`) + teste Vitest do comportamento (rodar da raiz: `npx vitest run <arq>`).
- Rota `/api/v2/*` fina (auth + I/O + chama o service). Tenant do JWT, nunca do body/query.
- Isolamento por `tenant_id` explícito em toda query (`supabaseAdmin` ignora RLS).
- Front repontado via `@/src/lib/apiClient` (drop `?tenantId`/`x-tenant-id`).
- `npm run typecheck:legacy` (raiz) **limpo (0)** + `cd apps/api && npx tsc --noEmit` **não aumenta o
  baseline pré-existente (~56 erros em 22 arquivos)** e 0 erros nos arquivos novos.
- **SÓ então** remover a rota do Express (`server.ts` mount + `src/routes/<x>.ts`). R5.
- Commit "fatia limpa": revisar o diff INTEIRO de páginas compartilhadas antes de `git add <arquivos exatos>`.

## 4. Riscos
- **Cutover S74/S76 não deve ligar sozinho** — portar backend ≠ trocar `ATENDIMENTO_ENGINE`/`COBRAI_ENGINE`.
  Rollback = trocar a env de volta.
- **Split-brain de fila** (cobrai/mensagens) — garantir consumidor único por fila durante a transição.
- **Auth divergente** — Fastify usa JWT próprio (`iss:astrum-api`); super-admin/webhooks precisam do
  gate certo (role `super_admin`; HMAC nos webhooks). Não afrouxar no port.
- **Webhooks = fail-closed** — erro na verificação de assinatura NUNCA deixa seguir (paridade APPSEC-05).

## 5. Ordem final
2-A.1 (os cleanup) → SPEC A liberada em paralelo → 2-A.2 (super-admin) → 2-A.3 (jobs) →
2-A.4 (cobrai) → SPEC B liberada (após verificar `dead_letter_queue`) → 2-A.5 (evolution/proxy +
repoints externos) → 2-A.6 (webhooks) → 2-A.7 (ai/ask) → **Fase 3** (SPA fora do Express).
