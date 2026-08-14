# PLANO — Unificar Backend (Express → Fastify) + Faxina de Código Morto

> Criado 2026-08-12. Contexto: sistema em TESTES, nada em produção. Diagnóstico feito
> lendo `server.ts` (raiz), `apps/api/src/server.ts` e os `fetch()` do frontend.
> Respeita R4 (lógica nova em apps/api) e R5 (portar+validar antes de apagar).

## 🔄 PONTO DE RETOMADA (nova sessão começa aqui) — 2026-08-12

**Estado:** Fase 0 ✅ (cliente central `src/lib/apiClient.ts` + inventário — Apêndice A). Fase 1 em andamento (triagem T3 → construir/remover — Apêndice C).
**Feito:** `webhooks` (T1 repoint) + BUILDs completos: **LGPD-expunge**, **integrations (ERP)**, **departments** (migration 097), **metrics** fcr+time+fcr-target (migration 098), **whatsapp/health-stats** (sem migration — Redis + fila), **personas + keys + prompts/validate** (sem migration — legacy_docs/helper de db), **quality/live-stats** (sem migration — agregados de tickets), **settings/holidays/fetch-national** (sem migration — feriados nacionais computados localmente), **domains/verify** (sem migration — lookup DNS via node:dns). Migrations 097/098 aplicadas via MCP + registradas em `schema_migrations`.
**Padrão a repetir p/ cada BUILD restante:** (1) migration da tabela se precisar → aplicar via MCP + registrar checksum em `schema_migrations`; (2) rota Fastify `/api/v2/...` em `apps/api/src/domain/...` + service PURO testável; (3) registrar em `apps/api/src/server.ts`; (4) repontar o front via `apiGet/apiPost/apiPut/apiDelete` de `@/src/lib/apiClient` (tenant vem do JWT, dropar `?tenantId`/`x-tenant-id`); (5) `npm run typecheck:legacy` + `cd apps/api && npx tsc --noEmit`.
**Próximos BUILD (Apêndice C, 🟢):** ✅ **TODOS os 🟢 feitos.** "REMOVER" reclassificado (não eram mortos): `/api/knowledge/articles*` **repontado pro Supabase** ✅; `/api/ai/ask` **deixado p/ Fase 2** (entrelaçado c/ cutover S74). Resta: **VERIFICAR** os T2/❓ (upsell, unmask, voip, service-orders/sync, backup, rag/scrape, incidents, tickets/human-response, billing) + reindex/search-test (gap vector/RAG) — ver Apêndice C. Depois **Fase 2** (portar rotas Express legadas).
**Tasks em background (outras sessões, não mexer nesses arquivos):** LGPD Zep/Qdrant (`lgpd-*`), webhook `deliveries/retry`, VoalleAdapter, inbox `metadata`→`extra`.
**⚠️ COMMITAR o acumulado antes de continuar** (muitas mudanças locais: Fase 0 + 4 features + migrations 097/098 + repoints). Ambiente já ativo: `TENANT_RLS_ROUTES_ENABLED=true` + pooler no `.env`.

## 1. Diagnóstico — por que o backend "chama o errado"

Hoje sobem **dois servidores no mesmo processo**:

| | Express (raiz `server.ts`) | Fastify (`apps/api`) |
|---|---|---|
| Porta | **3000** (porta de entrada) | **3001** (motor novo) |
| Papel | serve o SPA + rotas **`/api/*` legadas** + **PROXY `/api/v2/*` → Fastify** | atende **todo `/api/v2/*`** (~80 módulos) + roda os **workers** BullMQ |
| Banco | Supabase via `db-compat` | Supabase via `supabaseAdmin` |
| Quem sobe | é o processo principal | é iniciado **pelo Express** (`startFastifyServer()`, linha 30) |

**A raiz do problema:** o frontend faz `fetch('/api/...')` **cru e hardcoded, SEM cliente central**, misturando dois prefixos:
- `/api/...` → Express (legado)
- `/api/v2/...` → Fastify (via proxy)

Sem um ponto único que decida o prefixo, é trivial chamar o backend errado. **Evidências concretas de rotas quebradas (404) achadas no diagnóstico:**
- `/api/personas` (AIConfigPage) → só existe `/api/v2/ia/wind-tunnel/personas` (outra coisa) → **404**
- `/api/webchat/config` (WebchatPage) → `src/routes/webchat.ts` existe mas **não é montado** → **404**
- `/api/hsm-templates` (WhatsAppPage/CustomersPage) → `src/routes/hsmTemplates.ts` existe, **não montado** → **404**
- `/api/whatsapp/health-stats` (WhatsAppPage) → **não existe** em lugar nenhum → **404**

→ A intuição do dono está correta: a topologia de 2 backends + falta de cliente central causou **misrouting sistêmico**.

## 2. Alvo

- **Fastify = único backend.** É superior ao Express aqui: validação por schema (Zod/JSON-schema), plugins de segurança já montados (helmet, jwt, hmac, rate-limit, idempotency), performance, e a arquitetura DDD já está lá. O Express legado é aposentado.
- **Um cliente de API central no frontend** → fica impossível chamar o backend errado (o path certo é decidido num lugar só).

## 3. Fases (incremental, seguro, sem big-bang)

### Fase 0 — Cliente de API central + inventário  *(base de tudo, baixo risco)*
1. Criar `src/lib/apiClient.ts`: função única `api(path, opts)` que (a) resolve a base URL, (b) injeta o `Authorization: Bearer` da sessão Supabase (`supabase.auth.getSession()`), (c) trata erro/JSON. **Toda** chamada do frontend passa a usar isso.
2. Inventariar **todos** os `fetch('/api...')` do frontend → tabela: `caminho chamado → backend real (Express | Fastify | inexistente) → status`. (grep já mostrou dezenas; formalizar.)
3. Ganho imediato: centraliza a decisão de rota e elimina a classe "chamou o errado".

### Fase 1 — Corrigir os 404 de roteamento  *(bugs vivos)* — **EM ANDAMENTO (2026-08-12)**
Para cada rota que o front chama e dá 404, decidir: (a) montar no Express se ainda é legado necessário, (b) repontar para a rota Fastify `/api/v2` correta, ou (c) portar pro Fastify.

**Aprendizado da 1ª rodada — a Categoria C tem 3 sub-tipos, NÃO só "prefixo errado":**
1. **Repoint limpo** — o handler existe no Fastify e o contrato bate. ✅ **FEITO: WebhooksPage** — `/api/webhooks/endpoints*` (404) → `/api/v2/webhooks/endpoints*`. **Bônus: era bug duplo** — além do 404, o body estava errado (`{tenantId, description, event_types}` snake_case; o backend quer `{url, eventTypes}` camelCase e deriva tenant do JWT) → a tela **nunca funcionou**. Agora list/add/delete funcionam. O `deliveries/:id/retry` é **gap de backend** (rota não existe) → task aberta.
2. **Shape mismatch** — o handler existe mas com contrato diferente. Ex.: `ServiceOrdersPage` chama `/api/incidents/active` + `/:id/resolve`, mas o Fastify tem `/api/v2/rede/incidents` + `/scan|confirm|normalize|cancel|communicate` (a `IncidentsPage` usa o certo). A tela foi escrita contra uma API que nunca existiu nesse formato → precisa adaptar o front OU criar as rotas.
3. **Feature gap** — não há handler em lugar NENHUM. Ex.: **`/api/integrations/*`** (Settings/ERP) — grep não achou handler; o modelo do Fastify é `/api/v2/erp/credentials` (diferente) e as ESCRITAS já vão direto ao Supabase (`saveIntegrationKeys`, SEC-R5). Decisão de design (construir a rota OU refatorar o front OU remover chamada morta).

→ **Consequência:** a Fase 1 NÃO é mecânica. Cada endpoint da Categoria C precisa ser classificado (1/2/3) e tratado conforme. Os tipos 1 são wins rápidos; os tipos 2/3 precisam de decisão de produto.

### Fase 2 — Portar rotas legadas Express → Fastify `/api/v2`  *(uma a uma, R5)*
Rotas legadas montadas hoje no Express: `super-admin`, `cobrai`, `queues`, `dlq`, `os`, `evolution`, `jobs`, `webhook/facebook`, `webhook/evolution`, `webhook/asaas`.
Para cada: criar equivalente fino em `apps/api` (sobre os services), repontar o `apiClient`, validar com teste, e **só então** remover do Express.
⚠️ **Webhooks** exigem cuidado: verificação HMAC sobre **raw-body** + fail-closed. O Fastify já tem `webhook-hmac.plugin` — garantir paridade antes de mover (o Express hoje faz isso via `express.json({verify})` → `req.rawBody`, APPSEC-05).

### Fase 3 — Servir o SPA fora do Express
Hoje o Express serve o Vite (dev) / `dist/client` (build). Opções: (a) Fastify serve os estáticos (`@fastify/static`), ou (b) frontend 100% na Vercel/CDN e Fastify vira **só API**. Decisão de topologia do dono (cruza com INFRA-01: hoje o backend roda como `npm run dev` numa workstation — SPOF).

### Fase 4 — Aposentar o Express
Quando nada mais chama `/api/*` legado **e** o SPA é servido fora: remover `server.ts` raiz + `src/routes/*`, o proxy some, e o Fastify vira o processo principal. O próprio código já prevê isso: o comentário no `apps/api/src/server.ts` diz *"process.exit(1) volta na S82, quando o Fastify for o processo principal"*.

## 4. Riscos / dependências
- **Auth divergente:** Fastify usa JWT próprio (`iss:astrum-api`, `aud:astrum-operator`); o legado verifica JWT Supabase (`authVerify.ts`). Unificar auth é pré-requisito de parte das rotas (cruza com MT-02(a)/(b), decisão de arquitetura de auth ainda aberta).
- **Cutover de atendimento (S74):** o worker v2 de mensagens já roda em *shadow* (`ATENDIMENTO_ENGINE=legacy`). A migração de backend **não** deve ligar o cutover por si só.
- **RLS (MT-02c):** as 16 rotas já migradas para `withTenantRLS` estão no Fastify — a unificação **reforça** isso (mais tráfego passa pelo motor que tem a defesa em profundidade).

## 5. Faxina — inventário (2026-08-12)
- ✅ **REMOVIDO:** `firebase-applet-config.json` (config de projeto **AI Studio/Firebase** abandonado — `projectId: gen-lang-client-*`, `firestoreDatabaseId: ai-studio-*`; viola R2 "Firestore removido"). Nenhum código o importava.
- 🟢 **VIVO (não é lixo):** `src/lib/gemini.ts` (front: App/AIConfig/Chat/CustomerDetails), `src/lib/gemini.server.ts` (back: messageWorker/toolRegistry/tenantGuard), `src/ai-provider/*` (multi-provider, usado pelo legado **e** referenciado por `apps/api` — sendo portado, R3). Só saem quando o legado sair (Fase 4).
- 🐛 **BUG, não lixo:** `src/routes/hsmTemplates.ts` e `src/routes/webchat.ts` existem mas **não são montados** → Fase 1.

## APÊNDICE A — Inventário dos `fetch('/api...')` do frontend (Fase 0, 2026-08-12)

Levantados **~197 fetches** em `src/`. Cliente central criado: `src/lib/apiClient.ts` (`api/apiGet/apiPost/apiPut/apiPatch/apiDelete` — base URL + `Authorization: Bearer` + JSON + `ApiError` num só lugar; teste 7/7 em `src/__tests__/lib/apiClient.test.ts`). Categorização por destino:

### A) `/api/v2/*` → Fastify — **OK** (prefixo certo)
A maioria das telas `intelligence/*` (Churn, Cfo, Campaigns, Drift, Guardrails, Incidents, Labeling, Mcp, Models, NetworkHealth, NetworkTwin, PolicyLab, Reflections, Replay, ReviewQueue, Sandbox, Staffing, Synthetic, Tools, VoiceQa) + Valor, Genesis, SmartHome, Cobrança, Field (`fieldOps.ts`), KB drafts, Trial, Health. Estas só precisam **passar a usar o `apiClient`** (Fase 0), sem mudar rota.

### B) `/api/*` legado **montado** no Express — **funciona**
`/api/system/webhook-url`, `/api/evolution/proxy` + `/fetch-history`, `/api/dlq` + `/:id/retry`, `/api/queues/stats`, `/api/jobs/schedule-*`, `/api/super-admin/*`, `/api/health/whatsapp`.

### C) `/api/*` legado **NÃO montado** no Express → **provável 404 / misrouting** (o alvo da Fase 1)
Estas telas chamam prefixos que o `server.ts` raiz não monta. Precisam ser mapeadas: montar no Express (se legado vivo), **repontar para o Fastify `/api/v2`** (quando já existe lá), ou portar. Hipótese de alvo entre parênteses:

| Endpoint chamado (tela) | Situação / alvo provável |
|---|---|
| `/api/integrations/*` (Settings, ERPIntegrations, AIConfig, KB) — ixc/voalle/hubsoft/sgp/rbx/ping/test, embeddings, vectorstore, redis | **maior bloco**; provável Fastify `erp-admin` (`/api/v2/erp/*`) — mapear |
| `/api/knowledge/*` (KnowledgeBase) — articles, reindex, search-test | Fastify KB? (`/api/v2/kb/*`) — mapear |
| `/api/rag/upload-pdf`, `/api/rag/scrape-url` | Fastify `documents/upload` + rag — repontar |
| `/api/incidents/*` (ServiceOrders) | **existe** no Fastify: `/api/v2/rede/incidents` — repontar |
| `/api/hsm-templates*` (WhatsApp, Customers) | `src/routes/hsmTemplates.ts` existe, **não montado** — montar ou portar |
| `/api/webchat/*` (Webchat) | `src/routes/webchat.ts` existe, **não montado** — montar ou portar |
| `/api/webhooks/*` (Webhooks) | Fastify tem `webhook-config` — conferir prefixo e repontar |
| `/api/personas*` (AIConfig) | sem equivalente claro — investigar |
| `/api/keys`, `/api/prompts/validate` (AIConfig) | investigar |
| `/api/billing/*` (Billing) | `apps/frontend` billing? investigar |
| `/api/tickets/human-response` (Chat) | Fastify `/api/v2/tickets` — repontar |
| `/api/voip/initiate-call` (Chat) | Fastify voz — investigar |
| `/api/metrics/fcr`, `/api/metrics/time-quality` (cards) | Fastify analytics — investigar |
| `/api/settings/*` (holidays, fcr-target), `/api/departments/*`, `/api/domains/verify`, `/api/backup/trigger` | investigar (legado?) |
| `/api/lgpd/expunge` (Security) | Fastify compliance — repontar |
| `/api/quality/live-stats`, `/api/service-orders/sync`, `/api/whatsapp/health-stats`, `/api/unmask`, `/api/upsell/convert`, `/api/ai/ask` (gemini.ts) | investigar caso-a-caso |

> ⚠️ "Provável 404" = inferido do que o `server.ts` monta; a Fase 1 confirma cada um com uma chamada real e decide montar/repontar/portar. **É exatamente aqui que mora o "sistema chama o backend errado".**

## APÊNDICE B — Classificação completa da Categoria C (2026-08-12)

Cruzei cada `/api/*` quebrado contra o mapa de **141 rotas `/api/v2` do Fastify** + os mounts do Express. Legenda: **T1** repoint limpo (existe + contrato bate) · **T2** shape mismatch (existe, contrato diferente) · **T3** feature gap (não há handler em lugar nenhum) · **ML** legado existe mas não montado (mount ou portar).

| Chamada do frontend (tela) | Equivalente no backend | Tipo | Ação |
|---|---|---|---|
| `/api/webhooks/endpoints*` (Webhooks) | `/api/v2/webhooks/endpoints*` | **T1** | ✅ **FEITO** |
| `/api/webhooks/deliveries/:id/retry` | — | T3 | task aberta |
| `/api/webchat/*` (Webchat) | `src/routes/webchat.ts` (não montado) | **ML** | montar OU portar (fácil) |
| `/api/hsm-templates*` (WhatsApp/Customers) | `src/routes/hsmTemplates.ts` (não montado) | **ML** | montar OU portar (fácil) |
| `/api/incidents/active`, `/:id/resolve` (ServiceOrders) | `/api/v2/rede/incidents` (shape ≠) | T2 | adaptar front OU criar rotas |
| `/api/rag/upload-pdf` (KB/AIConfig) | `/api/v2/documents/upload` | T2 | repontar + ajustar shape |
| `/api/billing/subscription\|invoices` (Billing) | `/api/v2/billing/plan` (≠) | T2 | verificar/adaptar |
| `/api/tickets/human-response` (Chat) | `/api/v2/tickets` (sem `human-response`) | T2/T3 | verificar |
| `/api/integrations/*` (Settings/ERP/AIConfig/KB) | `/api/v2/erp/credentials` (modelo ≠; escrita já vai direto ao Supabase) | **T3** | **decisão de design** (maior bloco) |
| `/api/knowledge/articles*\|reindex\|search-test` (KB) | — (`kb/drafts` é outra coisa) | T3 | construir OU remover |
| `/api/rag/scrape-url` (KB) | — (só `rag/query`) | T3 | construir OU remover |
| `/api/personas*` (AIConfig) | — (só wind-tunnel) | T3 | construir OU remover |
| `/api/keys`, `/api/prompts/validate` (AIConfig) | — | T3 | construir OU remover |
| `/api/voip/initiate-call` (Chat) | — | T3 | construir OU remover |
| `/api/metrics/fcr\|time-quality` (cards) | — | T3 | construir OU remover |
| `/api/settings/holidays\|fcr-target` | — | T3 | construir OU remover |
| `/api/departments/*` (Settings) | — | T3 | construir OU remover |
| `/api/domains/verify` (Settings) | — | T3 | construir OU remover |
| `/api/backup/trigger` (Settings) | — | T3 | construir OU remover |
| `/api/lgpd/expunge` (Security) | — (`compliance/*` é outra coisa) | T3 | construir OU remover |
| `/api/quality/live-stats` (QualityMonitor) | — | T3 | construir OU remover |
| `/api/unmask` (MaskedSensitiveData) | — | T3 | verificar |
| `/api/upsell/convert` (App) | — | T3 | construir OU remover |
| `/api/whatsapp/health-stats` (WhatsApp) | — | T3 | construir OU remover |
| `/api/service-orders/sync` (TechnicianApp) | `/api/v2/portal/service-orders` (≠) | T3 | verificar |
| `/api/ai/ask` (gemini.ts) | — | T3 | verificar |

**Investigação de 2ª rodada (2026-08-12) — os "quase-wins" também não são mecânicos:**
- **`webchat` (ML)** — o `POST /message` está ACOPLADO ao worker (enfileira em `messageQueue` + long-poll no Redis `webchat_response:${sessionId}` esperando o `messageWorker` legado responder). Portar a rota sem portar o lado do worker quebra a resposta; e cruza com o cutover S74 (`ATENDIMENTO_ENGINE`). → **Fase 2, não quick-win.**
- **`hsm-templates` (ML)** — **NÃO existe tabela `hsm_templates` no Supabase** (verificado via MCP). A rota legada (mesmo montada) falharia/retornaria vazio → feature **incompleta** (rota sem tabela). → na prática **T3**.
- **`/api/rag/upload-pdf` (T2)** — contrato incompatível: o legado **extrai texto síncrono** e devolve `{rawText}`; o `/api/v2/documents/upload` **indexa async** (outbox) e devolve `{id,status}`. Repontar quebra o passo de criar artigo. → **rework de front, não repoint.**

**Veredito da classificação:** só **1 T1** (webhooks, feito). ~4 T2 (adaptáveis). **~18 T3 (feature gap)** — o backend dessas features **nunca foi construído**. Ou seja: o problema não é "roteamento errado" na maioria — é que **o frontend foi feito muito à frente do backend** (coerente com "tudo em testes"). A Fase 1 vira, na prática, uma **triagem de produto**: para cada T3, decidir *construir a rota no Fastify* ou *remover o botão/chamada morta*. Não dá pra automatizar sem essa decisão.

## APÊNDICE C — Proposta de triagem dos T3 (2026-08-12) — AGUARDA CONFIRMAÇÃO DO DONO

Recomendação por endpoint. `bknd` = tem lógica de backend hoje? (grep). Confiança: 🟢 alta / 🟡 média.

### 🔨 CONSTRUIR (feature real de ISP/produto → criar rota Fastify + tabela + teste)
| Endpoint | Por quê | bknd | Conf |
|---|---|---|---|
| `/api/integrations/*` (ERP: ixc/voalle/hubsoft/sgp/rbx + ping/test) | ✅ **FEITO (2026-08-12) — era T2 (backend existia).** SettingsPage migrada p/ `/api/v2/erp/credentials` via `apiClient`: 5 fetch de pré-preenchimento → 1 `fetchErpStatus` (status "configurado", **não devolve segredo** — fecha o vazamento de token pro browser); 5 save + 5 test repontados; selo "✓ Configurado" por provider. Backend: `rbx` adicionado a `ALLOWED_PROVIDERS` (tipo+factory já suportavam); validação relaxada p/ aceitar `clientSecret` (voalle OAuth). As credenciais ERP agora **salvam CIFRADAS** (`tenant_erp_credentials`) em vez do 404 anterior. Typecheck limpo. ⚠️ `voalle` OAuth: SAVE ok; test do VoalleAdapter → **task aberta**. **Nota de escopo:** isto NÃO é o SEC-R5 — o `saveIntegrationKeys` (texto puro em `tenants.integration_keys`, p/ `evolutionUrl` etc.) é outro caminho, não tocado. | **existe→feito** | 🟢 |
| `/api/lgpd/expunge` | ✅ **CONSTRUÍDO (2026-08-12)** — `POST /api/v2/lgpd/expunge` (`lgpd.routes.ts` + `lgpd-expunge.service.ts`, teste 4/4). **Anonimiza, não deleta** (retenção fiscal de invoices/OS + FK; LGPD Art. 16 II): zera name/email/cpf/phone/address em `customers`, customer_name/address em `service_orders`, content em `messages`. Admin-only, tenant do JWT, via `withTenantRLS` (cross-tenant bloqueado pela RLS), audit em `audit_log` via service_role. Front (SecurityPage) repontado via `apiClient`. | não→feito | 🟢 |
| `/api/whatsapp/health-stats` | ✅ **CONSTRUÍDO (2026-08-13)** — `GET /api/v2/whatsapp/health-stats?instanceId=` (`whatsapp-health.routes.ts` + `whatsapp-health.service.ts` puro, teste 7/7). Lê os sinais REAIS que o `rateLimiter` legado grava no Redis (`ban_signals:${inst}`, `pause_jobs:${inst}`, `daily_msg_count:${tenant}:${dia}`) + waiting da fila global `astrum-messages`. Antes o front batia em `/api/whatsapp/health-stats?tenantId=` (404 — nunca existiu) → card sempre zerado. Tenant do JWT (dropado o `?tenantId`); instância validada como do tenant via `tenant_evolution_instances` (impede sondar ban de outro tenant). Front (WhatsAppPage `fetchHealth`) repontado via `apiGet`. Typecheck limpo. | não→feito | 🟢 |
| `/api/metrics/fcr` + `/api/metrics/time-quality` + `/api/settings/fcr-target` | ✅ **CONSTRUÍDO (2026-08-12).** Descoberta: o `fcr.worker` (S79) gravava em `daily_metrics` — **tabela que nunca existiu** → upsert falhava silencioso + cards liam fonte vazia + rotas 404. **Migration 098** cria `daily_metrics` (RLS) + `tenants.fcr_target` (isso **também conserta o worker**). Rotas Fastify `GET /api/v2/metrics/fcr`, `POST /api/v2/metrics/time-quality`, `POST /api/v2/settings/fcr-target` (`metrics.routes.ts` + `metrics.service.ts` puro, teste 5/5). Cards FCRMetricsCard + TimeMetricsCard repontados via `apiClient`. ⚠️ **Limitação:** `time-quality.ranking` (por operador) fica `[]` — `daily_metrics` só tem agregados por dia/tenant, não por-operador. | não→feito | 🟢 |
| `/api/departments/*` | ✅ **CONSTRUÍDO (2026-08-12).** Feature estava 100% quebrada (lia de `tenants.departments` — coluna INEXISTENTE → vazio; escrevia em `/api/departments` → 404). Feito do zero: **migration 097** cria tabela relacional `departments` + RLS `tenant_own` (aplicada via MCP, isolamento provado, advisors limpos, registrada). Rota Fastify `GET/POST/PUT/DELETE /api/v2/departments` (`departments.routes.ts` + `departments.service.ts` com sanitização, teste 7/7). Front (SettingsPage) repontado via `apiClient` (read+save+delete + reload). Typecheck limpo. | não→feito | 🟢 |
| `/api/personas*` + `/api/keys` + `/api/prompts/validate` | ✅ **CONSTRUÍDO (2026-08-13).** **personas** (`/api/v2/personas` CRUD, `personas.routes.ts` + `personas.service.ts` puro com port `PersonaStore`, teste 12/12): PORTADO do `personaManager.ts` (R5) escrevendo na MESMA fonte que o `messageWorker` lê — coleção `ai_personas` no `legacy_docs` (031) → **sem split-brain**, sem migration. Isolamento imposto no service (legacy_docs não tem RLS): toda leitura/escrita filtra/valida `tenant_id` do JWT; unset-default só afeta o próprio tenant. **prompts/validate** (`/api/v2/prompts/validate`, validação PURA não-vazio/tamanho/placeholders balanceados, teste 6/6 — antes 404 travava o "Validar e salvar"; `test_response` via LLM fica p/ depois). **keys**: era redundante — repontado o front pro helper `saveIntegrationKeys` de `@/src/lib/db` (mesmo caminho de Settings/WhatsApp, `tenants.integration_keys`), **sem** rota nova. Front (AIConfigPage) repontado via `apiClient`; dropados `?tenantId`/`x-tenant-id`. Typecheck limpo; 332 testes do domínio atendimento verdes. | parcial→feito | 🟢 |
| `/api/quality/live-stats` | ✅ **CONSTRUÍDO (2026-08-13).** `GET /api/v2/quality/live-stats` (`quality-stats.routes.ts` + `quality-stats.service.ts` puro, teste 9/9). Descoberta via MCP: **não existe** tabela de CSAT/escalação/sentimento; `tickets` não tem csat nem timestamp de resolução. Então cada um dos 5 cards usa o melhor sinal REAL e o que não tem fonte fica explícito, **sem inventar**: `open_tickets`=contagem viva `status='open'`; `resolved_last_24h` (card "% s/ Escalation 24h")=% dos tickets tocados em 24h que NÃO estão `status='escalated'` (status de escalação existe no modelo); `avg_response_time_ms`=`daily_metrics.tmr_total_ms` do dia mais recente; `avg_csat_week`=**0 (sem fonte de CSAT)**; `top_escalating_agent`=agente com mais `escalated` nas 24h, nome via `team_members`, senão "N/A". Agregação validada contra dados reais via MCP. Front (QualityMonitorPage) repontado via `apiGet`; dropado `x-tenant-id`. Tenant do JWT. | não→feito | 🟢 |
| `/api/settings/holidays/fetch-national` | ✅ **CONSTRUÍDO (2026-08-13).** `POST /api/v2/settings/holidays/fetch-national` → `{count,total,year}` (`holidays.routes.ts` + `holidays.service.ts` puro, teste 8/8). Add/remove/leitura de feriados já iam direto ao Supabase (`tenants.holidays`); só faltava carregar os nacionais. Feito **sem API externa**: computa os feriados nacionais oficiais (fixos + Sexta-feira Santa via Computus da Páscoa + Consciência Negra 2024+) e **mescla sem sobrescrever** feriados manuais (idempotente). Front (SettingsPage) repontado via `apiPost` + recarrega a lista; dropado o `tenantId` do body, tenant do JWT. `fcr-target` já foi na migration 098. | não→feito | 🟢 |
| `/api/domains/verify` | ✅ **CONSTRUÍDO (2026-08-13).** `GET /api/v2/domains/verify?domain=` → `{status,matchedBy?,error?}` (`domain-verify.routes.ts` + `domain-verify.service.ts` puro, teste 8/8). Faz lookup DNS (`node:dns`) e confere se o domínio aponta pro host da plataforma (CNAME == `CUSTOM_DOMAIN_CNAME_TARGET`/default `app.astrum.ai`, ou interseção de IPs A). Domínio validado por regex (bloqueia IP/localhost/lixo); **só DNS, sem HTTP ao domínio (sem SSRF)**. Front (SettingsPage `verifyDomain`) repontado via `apiGet`. **Escopo:** só torna o botão "Verificar DNS" funcional — SERVIR o SPA sob domínio custom é topologia (Fase 3), decisão de whitelabel-como-plano segue aberta. | não→feito | 🟢 |

### 🗑️ REMOVER — reclassificado 2026-08-13: **NÃO eram chamadas mortas** (investigação inverteu a hipótese)
| Endpoint | Situação real / decisão | Conf |
|---|---|---|
| `/api/ai/ask` (`gemini.ts`) | ⏸️ **DEIXADO P/ FASE 2 (decisão do dono, 2026-08-13).** NÃO é morto: o `getAIResponse` **client** (≠ do `gemini.server` que o worker usa) alimenta 3 features vivas hoje quebradas (404): teste de agente (`App.handleTestAgent`, `AIConfigPage:254`) + simulação de resposta da IA no chat (`App.tsx:2270` → `sendMessage(...,'ai')`). O substituto v2 existe (`POST /api/v2/chat/stream`, agente c/ guardrails+RAG+tools+SSE) mas com **contrato incompatível** (single-message SSE vs history+session_state+forceCategory→JSON com category/session_state_update/shouldEscalate) e **cruza o cutover S74** (`ATENDIMENTO_ENGINE`). Repoint = integração real da Fase 2, não deleção. Mantido como pendência. | 🟡 |
| `/api/knowledge/articles*` | ✅ **REPONTADO PRO SUPABASE (2026-08-13, decisão do dono).** NÃO era morto: o KnowledgeBasePage **lê** de `knowledge_articles` (Supabase) mas create/edit/delete iam pro 404. Create/edit/delete agora usam os helpers `createKBArticle/updateKBArticle/deleteKBArticle` de `@/src/lib/db` (RLS, mesmo caminho do read). **Bônus:** consertado bug pré-existente — `currentTenant` é a **string** do tenant id, mas a página inteira usava `currentTenant.id` (sempre `undefined`) → o guard do load (`if(currentTenant?.id)`) nunca disparava e a lista nunca carregava; agora usa `currentTenant` direto. Frontend-only, typecheck limpo (sem teste vivo no browser). | 🟢 |
| `/api/knowledge/reindex*` + `/search-test` + `/rag/scrape-url` + `/integrations/embeddings\|vectorstore/test` | ⏸️ **GAP SEPARADO** (vector/RAG) — precisam do backend de embeddings/qdrant. `loadConfigs` fica no-op inofensivo (guard `.id` próprio). Não tocado nesta rodada. | 🟡 |

### ❓ VERIFICAR (decisão sua / preciso de 1 olhada rápida)
**Triagem investigada 2026-08-13** (call site do front + backend disponível). Rec: 🟢 caminho claro · 🟡 precisa decisão. **Os 2 🟢 já foram CONSTRUÍDOS (rag/scrape-url + tickets/human-response); restam os 7 🟡.**
| Endpoint (tela) | Achado da investigação | Recomendação | Rec |
|---|---|---|---|
| `/api/rag/scrape-url` (KnowledgeBase) | ✅ **CONSTRUÍDO (2026-08-13).** Descoberta: o `site-scrape.worker` NÃO servia (scrapa `website_url` do tenant, não URL ad-hoc, e grava em `knowledge_base` — **tabela inexistente** → worker quebrado). Feito do zero: `POST /api/v2/rag/scrape-url {url}` (`scrape-url.routes.ts` + `scrape-url.service.ts` puro extract/chunk/title, teste 7/7). Guard **anti-SSRF** (`isSafeExternalUrl` — bloqueia IP privado/loopback/metadata/localhost; ⚠️ não cobre DNS-rebind) + timeout 15s + teto 2MB + content-type texto. Grava **um artigo** em `knowledge_articles`. Front (KnowledgeBasePage) repontado via `apiPost` + consertado o bug `currentTenant.id` (guard nunca passava). | ✅ | 🟢 |
| `/api/tickets/human-response` (Chat) | ✅ **CONSTRUÍDO (2026-08-13).** Descoberta: a coluna `human_responded` **NÃO existia** (write do App.tsx silenciava; reads do messageWorker/slaWorker sempre `undefined` → feature quebrada). **Migration 099** add `human_responded` + `_at` (aplicada via MCP + registrada). Rota `POST /api/v2/tickets/:id/human-response` (em `tickets.routes.ts`, tenant-scoped via `tenantQuery`+`.eq('id')`). Front (ChatPage) repontado via `apiPost`. Agora a IA **para de responder** após intervenção humana (comportamento pretendido religado). Bug pré-existente do `PATCH /api/v2/tickets/:id` sem `.eq('id')` → chip aberto. | ✅ | 🟢 |
| `/api/backup/trigger` (Settings) | ✅ **REMOVIDO (2026-08-14).** Era backup-p/-bucket da **era Firestore** (tab "Backup Automático (Firestore)" + GCP project), sem worker, 404. Removido botão + handler + estado; nota diz backup do banco é automático (Supabase+PITR). Config tab mantida (decisão do dono) — ⚠️ tab inteiro é obsoleto, candidato a remoção futura. | ✅ feito | 🟢 |
| `/api/unmask` (MaskedSensitiveData) | revela PII mascarada com `reason` obrigatório + `x-tenant-id`. **Sem** endpoint no apps/api. Feature de segurança real (revelar PII com auditoria LGPD). Manda `{value, reason}` e espera o valor cru — **design pendente:** `value` é o mascarado? o back precisa achar o original. | **CONSTRUIR COM auditoria** (audit_log de quem/quando/porquê) — mas precisa definir o contrato (referência vs valor). | 🟡 |
| `/api/voip/initiate-call` (Chat) | click-to-call outbound. Telefonia do apps/api é **só INBOUND** (`/telephony/voice/incoming` + stream); não há iniciação de chamada. Infra Twilio existe. | **CONSTRUIR** endpoint outbound (se click-to-call for prioridade) OU adiar. | 🟡 |
| `/api/upsell/convert` (App) | registra conversão de upsell (`customerId, currentPlan, suggestedPlan, outcome`); toast diz "Dashboard atualizado". **Sem** backend no apps/api. | **CONSTRUIR** rota que grava o evento (tabela/metrics) — **se** houver dashboard que consome; senão REMOVER. | 🟡 |
| `/api/service-orders/sync` (TechnicianApp) | PWA do técnico enfileira mutações de OS offline e sincroniza (`item` = mutação). apps/api tem `campo` (field-ops) + `/api/v2/portal/service-orders` (é o portal do ASSINANTE, ≠). | **CONSTRUIR/mapear** rota de sync p/ o domínio `campo`. | 🟡 |
| `/api/incidents/active` + `/:id/resolve` (ServiceOrders, T2) | ✅ **ADAPTADO (2026-08-14).** ServiceOrdersPage → `GET /api/v2/rede/incidents` (filtra ativos: status ≠ normalizada/cancelada) + `PATCH /:id/normalize` ("resolver" = normalizar; backend notifica afetados só se já comunicados). Campos snake_case mapeados (cto_id/detected_at/affected_customers). Tenant do JWT. | ✅ feito | 🟢 |
| `/api/billing/subscription\|invoices/:tenantId` (Billing, T2) | ⚠️ **NÃO é adapt limpo (reclassificado 2026-08-14).** `ispSubscription`/`ispInvoices` = assinatura **do provedor à Astrum** (SaaS), não faturas de clientes. Tabela `invoices` tem `customer_id` (é ISP→assinante) → **sem casa no Supabase** p/ faturas do provedor. Vive no `apps/frontend` billing ou provedor de pagamento. **Decisão pendente:** identificar a fonte real antes de repontar. | ⏸️ pendente (fonte) | 🟡 |

## 6. Ordem recomendada de execução
Fase 0 (cliente central + inventário) → Fase 1 (matar os 404) → Fase 2 (portar rota a rota) → Fase 3 (SPA) → Fase 4 (aposentar Express). Fases 0 e 1 dão o maior alívio imediato com o menor risco.
