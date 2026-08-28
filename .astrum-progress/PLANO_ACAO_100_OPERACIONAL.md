# PLANO DE AÇÃO — Sistema limpo e 100% operacional

> Criado 2026-08-24 pelo Claude Fable 5 (orquestrador) a partir do checkup geral feito na
> mesma data. Cada tarefa abaixo é uma spec HANDOFF **auto-contida**: o modelo executor
> não precisa de nenhum contexto além deste arquivo e do próprio repositório.
>
> **Gatilho:** o Lucas dispara uma tarefa colando no modelo executor a frase:
> `Leia o arquivo .astrum-progress/PLANO_ACAO_100_OPERACIONAL.md e execute APENAS a tarefa <ID>, seguindo as instruções à risca.`
>
> **Status:** marcar `[x]` + data + modelo executor ao concluir. Tarefa concluída DEVE
> atualizar este arquivo (seção da própria tarefa) com um resumo de 2–4 linhas do que foi feito.

---

## REGRAS GLOBAIS (valem para TODO executor, qualquer modelo)

1. **Escopo fechado.** Execute somente a tarefa pedida. Se no caminho você achar outro
   problema, NÃO conserte: anote na seção "Achados colaterais" no fim deste arquivo e siga.
2. **Se a realidade divergir da spec** (arquivo não existe, teste já falhava antes, número
   diferente do descrito), **PARE e reporte** — não improvise nem "adapte" a spec.
3. **Commit local, SEM push** — exceto quando a tarefa disser o contrário. O push só
   acontece depois da tarefa de auditoria correspondente (executada por um modelo Claude).
   Mensagem de commit: `<tipo>(<área>): <resumo> [PLANO-100 <ID>]`.
4. **Nunca** tocar em `.env`, imprimir valores de secrets, ou desabilitar testes para
   "fazer passar". Nunca usar `--no-verify`.
5. **Verificação obrigatória** antes de dar a tarefa como concluída — cada tarefa lista os
   comandos. Cole a saída (resumida: contagem de testes, exit code) no seu relatório final.
6. **Regras do produto (CLAUDE.md na raiz):** R1–R6 continuam valendo. Em especial:
   frontend oficial é o legado (`src/pages/*`); lógica nova de backend vai em `apps/api`;
   Supabase é o único banco.
7. Comandos de verificação padrão (Windows, rodar da raiz do repo salvo indicação):
   - Frontend: `npm run test:unit` (esperado: ~617 testes verdes) e `npm run typecheck:legacy`
   - Backend: `cd apps/api && npm test` (esperado: ~2614 verdes) e `cd apps/api && npm run typecheck`

## MAPA DE MODELOS

| Executor | Onde roda | Usar para |
|---|---|---|
| **DeepSeek V4 Pro** | OpenCode (plano Go) | Braçal bem especificado: migração de páginas, refactors mecânicos, deleção de código morto, bumps de dependência |
| **Claude Sonnet 5** | Claude Code | Auditorias de diff, mudanças sensíveis (cobrança), documentação de regras |
| **Claude Opus 5 / Fable 5** | Claude Code | Mudanças no banco de produção e análises de segurança (exigem Supabase MCP + julgamento) |
| **Claude Haiku 4.5** | Claude Code | Só tarefas triviais (commits, docs pequenas) — não usar para código |

⚠️ **Supabase MCP só existe no Claude Code** (é do ambiente, não do modelo). Toda tarefa
marcada `[MCP]` precisa rodar num Claude dentro deste projeto — o DeepSeek/OpenCode não
tem acesso ao banco.

---

# FASE 0 — Base

## [x] A0 — Commit dos arquivos pendentes + este plano
**Modelo:** Claude Fable 5 (feito na criação do plano, 2026-08-24)
Commitar `scripts/infra/install_healthcheck_monitor.bat` (modificado),
`scripts/infra/run_healthcheck_hidden.vbs` (novo, parte do healthcheck de 2026-08-23) e
este arquivo. Push direto no main (workflow padrão do Lucas).

---

# FASE 1 — P0: Frontend consultando Supabase direto (dados sumidos em produção)

**Contexto (vale para F1-INV até F1-AUD):** o frontend legado (`src/pages/*`) tem 15+
páginas fazendo `supabase.from(...)` direto com o client anônimo (`src/lib/supabase.ts`).
A migration `092_p0_rls_hardening.sql` revogou TODOS os grants do role `anon` — portanto
**toda query direta dessas páginas falha desde então**, e a maioria engole o erro com
`?? []` / catch vazio, mostrando listas vazias e zeros na UI sem ninguém perceber
(exemplo confirmado: `src/pages/DashboardPage.tsx:118`).

A correção é migrar essas leituras para rotas do `apps/api` (Fastify), que acessa o banco
com `service_role` e filtra por tenant via JWT. O padrão já existe dos dois lados:
- **Frontend:** `apiGet`/`apiPost` de `src/lib/apiClient.ts` (já injeta o JWT). Exemplo
  real de uso: `src/lib/apiAuth.ts` e as chamadas de Configurações → Integrações em
  `src/pages/SettingsPage.tsx` (`/api/v2/settings/integration-keys`).
- **Backend:** rotas em `apps/api/src/domain/<área>/*.routes.ts`, registradas em
  `apps/api/src/server.ts`. Copiar o estilo de uma rota existente da mesma área
  (autenticação por preHandler + leitura do tenant do JWT).

**Regras de segurança inegociáveis para TODA rota nova desta fase:**
- `tenantId` SEMPRE vem do JWT do request: `const tenantId = user.tenantId ?? user.tenant_id;`
  (o JWT usa camelCase; o fallback snake_case é o padrão das 17+ rotas corrigidas em
  2026-08-24). **NUNCA aceitar tenantId por query param ou body.**
- Toda query no Supabase usa `supabaseAdmin` (nunca o client `supabase` anônimo) e SEMPRE
  filtra `.eq('tenant_id', tenantId)`.
- Toda rota nova tem teste Vitest colocado (`*.routes.test.ts`) cobrindo: (a) 401 sem
  token; (b) resposta correta com token válido; (c) que o filtro de tenant é aplicado.

## [x] F1-INV — Inventário completo das queries diretas
**Modelo:** Claude Sonnet 5 (2026-08-24, com 3 subagentes de pesquisa em paralelo)
**Resumo:** 91 ocorrências de `supabase.from(`/`supabase.rpc(` mapeadas em
`src/pages`+`src/components`+`src/hooks` (0 no rpc, 0 em hooks). 90 são chamadas reais
(1 é comentário em teste): 4 `JA_EXISTE_ROTA`, 86 `PRECISA_ROTA_NOVA`, 0 `CODIGO_MORTO`.
Maior arquivo: `SettingsPage.tsx` (31). Detalhe completo em
[.astrum-progress/INVENTARIO_SUPABASE_DIRETO.md](INVENTARIO_SUPABASE_DIRETO.md). Achados
colaterais (fora do escopo, não corrigidos): ~85 ocorrências extras em `src/lib/*` e
`src/App.tsx` (fora do escopo pedido) e rotas com barra invertida quebrada em
`field-ops.routes.ts` — ambos anotados na seção "Achados colaterais" abaixo.
**Objetivo:** mapear TODAS as chamadas diretas ao Supabase no frontend antes de migrar.
**Passos:**
1. Liste todas as ocorrências: `grep -rn "supabase\.from(\|supabase\.rpc(" --include="*.tsx" --include="*.ts" src/pages src/components src/hooks`
2. Para cada ocorrência, registre numa tabela: arquivo:linha | tabela consultada |
   operação (select/insert/update) | o que a UI faz com o dado | rota `apps/api`
   equivalente JÁ existente (procure em `apps/api/src/domain/**/*.routes.ts` por rota que
   sirva o mesmo dado) | classificação: `JA_EXISTE_ROTA` / `PRECISA_ROTA_NOVA` /
   `CODIGO_MORTO` (a ocorrência está num caminho inalcançável — prove citando por quê).
3. Salve o resultado em `.astrum-progress/INVENTARIO_SUPABASE_DIRETO.md`, agrupado por
   página, com um sumário no topo (totais por classificação).
4. **Não altere nenhum código de produção nesta tarefa.** Commit só do inventário.
**Verificação:** o arquivo existe, cobre 100% das ocorrências do grep do passo 1 (confira
o total), e cada linha tem classificação.
**DoD:** inventário commitado; nenhuma outra mudança no repo.

## [x] F1-A — Migrar Dashboard + CobrAI + Billing
**Modelo:** Claude Sonnet 5 (2026-08-24)
**Resumo:** 9 ocorrências do inventário + 2 achadas na migração (multi-linha, ver
correção em [INVENTARIO_SUPABASE_DIRETO.md](INVENTARIO_SUPABASE_DIRETO.md)) migradas
para 7 rotas novas em 3 arquivos: `apps/api/src/domain/provedor/dashboard.routes.ts`
(upsell-events, csat-ratings), `apps/api/src/domain/cobranca/cobrai-page.routes.ts`
(dashboard-metrics, jobs/history, tenant-config, customers/:id/toggle-pause) e
`apps/api/src/domain/cobranca/billing-page.routes.ts` (isp-subscription,
invoices/mark-paid). Todas com `supabaseAdmin` + `.eq('tenant_id', ...)` do JWT
(`tenantId ?? tenant_id`), gates `billing:read`/`billing:write` onde fazia sentido
(CobrAIPage GET fica só em `authenticate`, mesmo padrão do `queue-monitor.routes.ts`
sibling). 25 testes Vitest novos (401 + sucesso + filtro de tenant). `grep -c
"supabase.from(" ` retorna 0 nas 3 páginas. Suites verdes: frontend 3404 passed/5
failed (falhas pré-existentes, timeout sob carga, confirmadas não-relacionadas por
re-run isolado 63/63 verde) / 7 skipped; backend 2618 passed/4 failed (mesmo padrão de
timeout pré-existente, confirmado por re-run isolado 55/55 verde) / 7 skipped.
Typecheck frontend e backend limpos. Commit local, SEM push (aguarda F1-AUD).
**Pré-requisito:** F1-INV concluída (use o inventário como fonte).
**Objetivo:** zero chamadas `supabase.from(`/`supabase.rpc(` em
`src/pages/DashboardPage.tsx`, `src/pages/CobrAIPage.tsx`, `src/pages/BillingPage.tsx`.
**Passos:**
1. Para cada ocorrência classificada `JA_EXISTE_ROTA`: troque por `apiGet`/`apiPost` da
   rota existente e adapte o shape do dado no ponto de uso (mínimo diff).
2. Para cada `PRECISA_ROTA_NOVA`: crie a rota em `apps/api` na área de domínio certa
   (dashboards → `domain/valor` ou área equivalente já existente; cobrança →
   `domain/cobranca`), seguindo as regras de segurança da FASE 1. Depois troque o
   frontend para consumi-la.
3. Para cada `CODIGO_MORTO`: remova o trecho morto (e imports órfãos).
4. Remova o import de `src/lib/supabase` de cada página que ficar sem uso dele.
**Proibido:** mudar layout/UX das páginas; criar rota que aceite tenantId externo;
usar o client anônimo no backend.
**Verificação:** comandos padrão (frontend + backend, seção Regras Globais item 7) +
`grep -c "supabase.from(" <cada página>` retornando 0.
**DoD:** 3 páginas sem query direta, testes novos das rotas criadas, suites verdes,
commit local SEM push (aguarda F1-AUD).

## [x] F1-B — Migrar Team + Chat + WhatsApp
**Modelo:** Claude Sonnet 5 (2026-08-25 — executado direto pelo Lucas em vez do
DeepSeek, ver nota de escopo abaixo)
**Resumo:** `TeamPage.tsx` migrada 100% (6/6 ocorrências) para
`apps/api/src/domain/provedor/team-page.routes.ts` (5 rotas: GET/POST/PUT/DELETE
`team/members`, GET `team/performance`, GET `team/ranking`; escrita gated por
`users:write`). `ChatPage.tsx` e `WhatsAppPage.tsx` migraram só a fração seguro
(1/7 e 1/3 respectivamente — ver nota abaixo): `ChatPage.tsx:201` (departamentos,
JA_EXISTE_ROTA) trocado por `GET /api/v2/departments` já existente, e
`WhatsAppPage.tsx:136` (delete de instância) para nova rota
`DELETE /api/v2/whatsapp/instances/:instanceName` em
`apps/api/src/domain/atendimento/whatsapp-page.routes.ts`. `grep -c "supabase.from("`:
TeamPage.tsx = 0; ChatPage.tsx = 6 (restam, landmine); WhatsAppPage.tsx = 2 (restam,
landmine). 17 testes Vitest novos (401 + sucesso + filtro de tenant + 403 RBAC nas
escritas de team). Suítes verdes: backend 2639 passed/0 failed/7 skipped, typecheck
limpo; frontend suite completa (com backend embutido) 3421 passed/5 failed/7 skipped —
as 5 falhas são pré-existentes e sem relação (SignupPage, server health, langgraph,
owasp-audit — timeout sob carga total), confirmadas por re-run isolado 55/55 verde;
typecheck frontend limpo. Commit local, SEM push (aguarda F1-AUD).

**Nota de escopo — F1-B ficou parcial por decisão do Lucas (não é um desvio silencioso):**
antes de escrever qualquer rota, uma consulta ao schema real do Supabase (via MCP)
mostrou que a maioria das ocorrências de `ChatPage.tsx` e `WhatsAppPage.tsx` grava/lê
colunas que **não existem** nas tabelas reais — um bug pré-existente, não causado pela
RLS (a mensagem do operador no chat, por exemplo, nunca foi persistida em produção; só
sai de fato pelo WhatsApp). Reportei o achado ao Lucas antes de prosseguir (regra global
2) e ele escolheu migrar só a fração seguro agora, deixando o resto documentado em
"Achados colaterais" pra uma tarefa futura de schema (decisão de produto, não só
engenharia — precisa decidir se cria coluna nova ou remove a feature morta).

## [x] F1-C — Migrar SettingsPage (a maior: ~31 chamadas)
**Modelo:** Claude Sonnet 5 (2026-08-25 — executado direto pelo Lucas em vez do
DeepSeek, mesma decisão da F1-B, ver nota de escopo abaixo)
**Resumo:** Antes de escrever qualquer rota, auditei via MCP (`information_schema.columns`)
TODAS as tabelas/colunas que as 31 ocorrências do inventário tocam. Achado: só **5 das 31**
miram schema real — as 3 de `team_members` (delete/update/insert, linhas 167/180/187) e as
2 de `tenants.enabled_modules` (select/update, linhas 419/425). As outras **26** (+ 1 não
capturada pelo grep, ver nota) gravam/leem colunas e tabelas que **não existem** no banco —
mesmo padrão de bug já achado na F1-B (ChatPage/WhatsAppPage), só que aqui é a maioria da
página, não a minoria. Migradas as 5 seguras: `team_members` reaproveita as rotas já
existentes de `team-page.routes.ts` (F1-B, mesma tabela/shape) e `enabled_modules` ganhou
rota nova `GET/PUT /api/v2/settings/modules` em
`apps/api/src/domain/provedor/settings-page.routes.ts` (`supabaseAdmin` + `.eq('id',
tenantId)` do JWT). `grep -c "supabase.from("` em SettingsPage.tsx: 31 → 26 (as 26
restantes documentadas no achado colateral abaixo, não migradas — decisão de produto/schema
pendente, mesmo protocolo da F1-B). 8 testes Vitest novos (`settings-page.routes.test.ts`:
401 + 200/400 + filtro de tenant no GET e no PUT). Suítes verdes: backend 2646 passed/0
failed/7 skipped, typecheck limpo; frontend suite completa (com backend embutido) 3433
passed/0 failed/7 skipped — numa execução anterior sob carga total 3 testes deram timeout
(SignupPage, langgraph, owasp-audit, o mesmo padrão de flakiness já documentado na F1-B),
confirmados pré-existentes e sem relação por re-run isolado 53/53 verde (inclui
`SettingsPage.test.tsx` isolado); typecheck frontend limpo. Commit local, SEM push (aguarda
F1-AUD).

**Nota de escopo — F1-C ficou parcial por decisão do Lucas (repete o padrão da F1-B, agora
em escala maior):** a auditoria de schema via MCP mostrou que a tabela `tenants` real só
tem `active, ai_budget_hard_stop, ai_budget_usd_monthly, atendimento_engine,
cobrai_daily_limit, cobrai_hourly_limit, cobrai_stages, cobrai_window, created_at,
enabled_modules, escalation_rules, evolution_instance, extra, fcr_target, id,
integration_keys, is_sandbox, name, onboarding_done, onboarding_step, operators, plan,
settings, slug, subscriber_count, svix_app_id, trial_ends_at` — **nenhuma** das colunas
`sso_config`, `theme`, `vector_store_config`, `monthly_token_limit`, `worker_concurrency`,
`backup_*` (7 campos), `holidays` ou `integrations` (plaintext antiga) existe. A tabela
`role_permissions` real é `(id, role, resource, action)` — RBAC global estático, não tem
`tenant_id`/`role_name`/`permissions` (JSONB por tenant) como o código assume. Reportei ao
Lucas antes de escrever qualquer rota (regra global 2) e ele escolheu o mesmo caminho da
F1-B: migrar só a fração com schema real agora, documentar o resto pra uma tarefa futura de
desenho de schema (não é "portar query pra rota" — colunas/tabelas precisam ser criadas ou
a feature correspondente decidida como morta, caso a caso).
Mesma verificação e DoD da F1-A.

## [x] F1-D — Migrar as páginas restantes do inventário (Batch 1/2)
**Modelo:** Claude Sonnet 5 (2026-08-25 — executado direto pelo Lucas em vez do DeepSeek,
mesma decisão da F1-B/C, ver nota de escopo abaixo)

**Resumo:** Migradas 13 páginas/componentes com schema real confirmado via MCP antes de
escrever qualquer rota (mesmo protocolo da F1-B/C): `MonitoringPage.tsx` (DLQ discard +
notifications, 3 ocorrências), `QualityMonitorPage.tsx` (active-conversations + notifications,
2 de 4), `SuperAdminPage.tsx` (tenants/shadow_results/tenant_feature_flags, 4, painel
cross-tenant gateado por `role===super_admin`), `AIObservabilityPage.tsx` (ragas-scores +
guardrail-blocks, 2, **corrigido vazamento cross-tenant** — a query original não filtrava
`tenant_id`), `OnboardingWizardPage.tsx` (report-metrics, 3 de 4, dropada a segunda trilha de
auth via `supabase.auth.getSession()`), `AIConfigPage.tsx` (só os 3 campos reais de CobrAI),
`InventoryPage.tsx` (import CSV, `price`→`price_cents`), `TicketsPage.tsx` (reusa
`POST /api/v2/tickets` existente + `GET /api/v2/departments`, `subject`→`title`),
`NetworkGraphPage.tsx`+`NetworkTwinPage.tsx` (rota nova dedicada `GET /api/v2/rede/ctos`,
**corrigido vazamento cross-tenant** — mesma falta de filtro), `KnowledgeBasePage.tsx` (lista
de artigos, 1 de 3), `Sidebar.tsx`+`SuperAdminRoute.tsx` (nova `GET /api/v2/auth/me` lendo
`role` do JWT — **corrige bug real**: o guard de `SuperAdminRoute` bloqueava TODO usuário,
inclusive super admins de verdade, porque a query antiga sempre falhava pela RLS),
`CustomerDetailsDialog.tsx`/`CustomerDetailSheet.tsx`/`CustomerHistorySidebar.tsx` (rota nova
`customers.routes.ts` — maior buraco transversal do inventário, não existia NENHUMA rota de
leitura de `customers` em `apps/api`; a subscrição Realtime do `CustomerHistorySidebar` saiu,
virou fetch-on-open como as demais telas — já não entregava eventos por causa da RLS, sem
regressão real). 9 rotas novas + 2 estendidas em 8 arquivos de rota (`notifications.routes.ts`,
`super-admin.routes.ts`, `customers.routes.ts`, `ai-config.routes.ts`,
`inventory-import.routes.ts`, `report-metrics.routes.ts`, `observability-data.routes.ts`, +
extensões em `dlq.routes.ts`, `quality-stats.routes.ts`, `graph.routes.ts`,
`knowledge-reindex.routes.ts`, `auth.routes.ts`), todas com `supabaseAdmin` +
`.eq('tenant_id', ...)` do JWT (exceto o painel super-admin, ver nota). 49 testes Vitest
novos (401 + sucesso + filtro de tenant, RBAC onde aplicável). Suítes completas verdes:
backend 2695 passed/0 failed/7 skipped, typecheck limpo; frontend 3482 passed/0 failed/7
skipped, typecheck limpo. Commit local, SEM push (aguarda F1-AUD).

**⚠️ Achado crítico — bugs de produção já commitados na F1-A (não pushados ainda,
`cobrai-page.routes.ts`), achados ao verificar schema real via MCP antes de escrever rotas
novas nesta tarefa:**
- `GET /api/v2/cobranca/dashboard-metrics` — filtra `customers.financial_status`, coluna que
  **não existe** (real: `status`, `cobrai_opted_out`, sem `financial_status`). 500 garantido.
- `GET /api/v2/cobranca/jobs/history` — seleciona `stage, template_name, error_message,
  sent_at` de `cobrai_jobs`; **nenhuma dessas 4 colunas existe** (schema real: `id, tenant_id,
  customer_id, invoice_id, bullmq_job_id, rule_id, status, scheduled_for, executed_at,
  created_at`). 500 garantido.
- `GET /api/v2/cobranca/tenant-config` — lê `tenants.cobrai_paused_customers`, coluna que
  **não existe**. 500 garantido.
- `GET /api/v2/dashboard/csat-ratings` (também F1-A) — lê `tickets.csat_score`, coluna que
  **não existe** (confirmado também por `quality-stats.service.ts`, que já documentava no
  próprio código "tickets não tem csat nem timestamp de resolução"). 500 garantido.
Os testes Vitest dessas rotas passam porque mockam o client Supabase — nunca bateram no
schema real. **F1-AUD precisa tratar isso antes do push** (essas rotas nunca funcionaram em
produção real, mas hoje são só "não pushadas ainda" — não é regressão desta tarefa).

> **✅ RESOLVIDO — 2026-08-25, Claude Sonnet 5, commit `ec10b97` (pushado direto, fora do
> fluxo normal de auditoria por pedido explícito do Lucas):** as 4 rotas corrigidas contra o
> schema real (reconferido via MCP, sem mudança desde a F1-D). Resumo por rota — ver diff
> completo em [cobrai-page.routes.ts](../apps/api/src/domain/cobranca/cobrai-page.routes.ts)
> e [dashboard.routes.ts](../apps/api/src/domain/provedor/dashboard.routes.ts):
> - `dashboard-metrics`: "inadimplentes" agora é contagem de `customer_id` distintos com
>   `invoices.status='overdue'` (24 invoices overdue existem hoje no banco; mesma definição
>   que `nightly-brain.service.ts` já usa para "overdue").
> - `jobs/history`: `stage` vem de `cobrai_rules.name` via embed no `rule_id`
>   (`cobrai_jobs_rule_id_fkey` confirmado); `sent_at` vem de `executed_at`.
>   `template_name`/`error_message` não têm coluna real — omitidos (ambos opcionais em
>   `CobraiLog` no `CobrAIPage.tsx`, UI não quebra).
> - `tenant-config`: a pausa é por cliente (`customers.cobrai_opted_out`, já usada pelo
>   `toggle-pause` da mesma rota), não uma lista solta no tenant — query trocada de
>   `tenants` para `customers` filtrando `cobrai_opted_out=true`.
> - `csat-ratings`: fonte real é `ai_performance_logs.extra->csat_score` — mesmo campo que
>   `nightly-brain.service.ts` (`gatherDailyMetrics`) já lê para CSAT médio. Confirmado via
>   MCP que **hoje nenhuma das 20 linhas de `ai_performance_logs` tem `csat_score` em
>   `extra`** — a rota não quebra mais, mas o widget continua vazio até algo popular o
>   campo (mesmo estado prático que `QualityMonitorPage.tsx` já assumia manualmente com
>   `setCsatRatings([])` e um comentário apontando este mesmo achado).
>
> Shape de resposta pro frontend **inalterado** nas 4 (`CobrAIPage.tsx`/`DashboardPage.tsx`
> não precisaram de mudança). Suite `apps/api` completa: **2719 passed / 0 failed / 7
> skipped**, exit 0 — inclusive os 4 arquivos que costumavam dar timeout sob carga total
> (`langgraph`, `replay`, `prompt-cache`, `owasp-audit`) passaram limpos rodando sozinhos.
> `typecheck:legacy` e `apps/api typecheck` limpos. Push direto autorizado pelo Lucas nesta
> sessão (não passou pelo fluxo padrão F1-AUD/AUD-G — F1-AUD segue pendente para o resto do
> lote F1, ver F1-D2 e "ACHADOS COLATERAIS").

**⚠️ Achado crítico — o inventário F1-INV está incompleto.** O grep do passo 1 da F1-INV
(`supabase\.from(`) só casa `supabase` e `.from(` na MESMA linha — a própria F1-INV já tinha
avisado disso (nota "Correção pós-F1-A") mas o F1-D não tinha reauditado o escopo inteiro
antes de começar. Rodando `supabase\s*\n\s*\.from\(` (multi-linha) em `src/pages` +
`src/components` aparecem **mais 18 ocorrências reais em 12 arquivos que a F1-INV reportou
como 0**: `AICostsPage.tsx` (4), `WebhooksPage.tsx` (2), `SyntheticPage.tsx` (2),
`EscalationRulesBuilder.tsx` (2), `ERPIntegrationsPage.tsx` (1), `SecurityPage.tsx` (1),
`OperatorMobilePage.tsx` (1), `TopHeader.tsx` (1), `SentimentMetricsCard.tsx` (1),
`IntelligenceHubPage.tsx` (1), `NetworkTwinPage.tsx` (1 — a ocorrência de CTOs desta já foi
corrigida nesta tarefa, reaproveitando a rota nova), `SandboxPage.tsx` (1). Bate exatamente
com a lista original da spec do F1-D ("AICosts... SecurityPage, OperatorMobile,
ERPIntegrations, intelligence/*") — o autor do plano já esperava essas páginas; só o
inventário gerado não as pegou. **Ficam para o F1-D Batch 2** (ver Achados Colaterais).

**Nota de escopo — F1-D ficou em 2 lotes por decisão de execução, não por bug achado
(diferente da F1-B/C):** o volume real de trabalho (13 páginas + 12 pendentes + auditoria de
schema em ~15 tabelas) excede o razoável para uma sessão só, então este lote fechou o que
tinha schema real E cabia com qualidade (rotas + testes) na sessão, deixando documentado e
isolado o que falta. Dentro do que FOI migrado, mesma disciplina da F1-B/C: campos sem coluna
real (ex.: `vector_store_config`, `pipeline_stage`, tabela `reflections`) foram deixados
intactos e documentados, não inventados.

**Pré-requisito:** F1-INV concluída (use o inventário como fonte).
**Objetivo original:** zero chamadas `supabase.from(`/`supabase.rpc(` nas páginas restantes.
**Verificação:** comandos padrão (frontend + backend, seção Regras Globais item 7) — ambos
verdes.
**DoD:** 13 páginas/componentes sem query direta (exceto gaps de schema documentados), rotas
novas com testes, suites verdes, commit local SEM push (aguarda F1-AUD).

## [x] F1-D2 — Migrar as 12 páginas que a F1-INV não pegou (multi-linha)
**Modelo:** Claude Sonnet 5 (2026-08-25, via MCP)
**Resumo:** as 12 chamadas listadas abaixo miravam TODAS colunas/tabelas reais (reconferido
via MCP — nenhuma repetiu o gap de `AIObservabilityPage`/`AIConfigPage` que a spec original
temia para `ai_performance_logs`). 11 páginas migradas, 1 documentada sem migrar:
- `AICostsPage.tsx` (4) → rota nova `ai-costs.routes.ts` (`attribution`, `logs`,
  `budget` GET/PUT, `sentiment-7d` — este último reaproveitado por `SentimentMetricsCard.tsx`).
- `WebhooksPage.tsx` (2) → `GET /api/v2/webhooks/deliveries` + `/config` em
  `webhook-config.routes.ts`. Corrigido de brinde um comentário desatualizado no
  `retryDelivery()` que dizia a rota de retry "ainda não existe" — ela já existia.
- `EscalationRulesBuilder.tsx` (2, `tenants.escalation_rules`) →
  `GET/PUT /api/v2/settings/escalation-rules` em `settings-page.routes.ts`.
- `SecurityPage.tsx` (1, `audit_log`) → rota nova `audit-log.routes.ts`.
- `TopHeader.tsx` (1, `tenants.operators`) → `GET /api/v2/team/operator-status` em
  `team-page.routes.ts`. Só a leitura — a escrita (`upsertTenantOperator`,
  `src/lib/supabaseDb.ts`) e a assinatura Realtime (`supabase.channel(...)` na mesma
  função) ficam fora do escopo, mesmo limite que a F1-INV já tinha registrado pra
  `src/lib/*` (achado colateral próprio, não desta tarefa).
- `ERPIntegrationsPage.tsx` (1, `tenant_erp_credentials`) → reaproveitado
  `GET /api/v2/erp/credentials` (já existe em `erp-admin.routes.ts`, usado por
  `SettingsPage.tsx`). **Achado colateral não corrigido:** o resto da página (salvar/
  testar credencial) chama `fetch('/api/integrations/${provider}...')` — rota Express
  mortA desde a Fase 4 (2026-08-17/18), 404 garantido; a página está com Salvar/Testar
  quebrados end-to-end há semanas. Corrigir exigiria reescrever o fluxo pro contrato de
  `erp-admin.routes.ts` (`{provider, credentials: {url, token|clientSecret|password},
  active}` em vez de campos soltos por provider) — fora do escopo desta tarefa (só
  cobria `supabase.from(`, não `fetch()` morto).
- `IntelligenceHubPage.tsx` + `SandboxPage.tsx` + `SyntheticPage.tsx` (3, todas
  `supabase.auth.getSession()` + `.from('users'|'tenants')`, nunca resolviam porque o
  app não usa Supabase Auth pra login) → reaproveitado `GET /api/v2/auth/me` (F1-D).
  **`/api/v2/auth/me` ganhou o campo `isSandbox`** (leitura de `tenants.is_sandbox`,
  única mudança que faz a rota tocar o banco — antes era 100% JWT) pra cobrir o gate da
  `SyntheticPage.tsx`, que também usava a sessão pra derivar `tenantId` (comentário
  errado no código dizia "`tenantId` no `useAppStore` não serve" — serve sim, é de lá
  que vem noutras 10+ páginas; a página só nunca tinha sido migrada). 2 testes de
  frontend (`SyntheticPage.test.tsx`, `SandboxPage.test.tsx`) reescritos pra mockar
  `apiGet('/api/v2/auth/me')` em vez do `supabase.auth`/`.from('users')` antigo.
- `NetworkTwinPage.tsx` (1, `network_ctos`) → reaproveitado `GET /api/v2/rede/ctos`
  (F1-D); `select` ampliado com `used_ports, total_ports, status` + filtro opcional
  `?status=` (aditivo — `NetworkGraphPage.tsx`, que só usa `id,name` sem filtro,
  continua igual).

**NÃO migrado (documentado, não consertado — regra global 1):**
`OperatorMobilePage.tsx` (1, `messages`) — a tabela real usa `conversation_id/content/
role+from_ai`, não `ticket_id/body/sender_type` como o `insert()` grava; é o **mesmo gap
já documentado pra `ChatPage.tsx` na F1-B** (decisão de produto pendente: criar o
mapeamento ticket→conversation ou aposentar o envio manual — não é engenharia de rota).

**Verificação:** `npm run typecheck:legacy` + `cd apps/api && npm run typecheck` limpos;
`npm run build` (Vite) ok, só warnings pré-existentes de code-splitting. Suites: root
**3497 passed / 7 skipped / 0 failed**, exit 0 (bate com a baseline 3457 + os testes
novos das rotas); `cd apps/api && npm test` **2719 passed / 0 failed / 7 skipped**,
exit 0 rodado isolado (sem contenção de carga do monorepo inteiro). Commit local
(`61fd64c`), **SEM push** (regra global 3 — aguarda F1-AUD, que também segue pendente
pra F1-A/B/C/D/D2 como um todo).

<!-- Spec original abaixo, mantida para referência -->

**Modelo:** Claude Sonnet 5 ou DeepSeek V4 Pro *(auditar schema real via MCP antes de
escrever qualquer rota — Claude se precisar do MCP; DeepSeek pode seguir o que já foi
verificado aqui, mas SEMPRE reconfirmar antes de gravar, o schema pode ter mudado)*
**Contexto:** achado da F1-D — ver "Achado crítico" acima. Lista completa (arquivo:ocorrências):
`AICostsPage.tsx` (4 — `ai_performance_logs` ×2, `tenants` ×2, mesmo padrão de `agent/step/
escalated` que não existe em `ai_performance_logs`, ver achado colateral da F1-D sobre
`AIObservabilityPage`/`AIConfigPage`), `WebhooksPage.tsx` (2 — `webhook_deliveries`,
`tenants.svix_app_id`, este último É real), `SyntheticPage.tsx` (2 — `tenants`, `users`),
`EscalationRulesBuilder.tsx` (2 — `tenants.escalation_rules`, **coluna real**, fácil),
`ERPIntegrationsPage.tsx` (1 — `tenant_erp_credentials`, tabela não confirmada, checar),
`SecurityPage.tsx` (1 — `audit_log`, tabela não confirmada, checar), `OperatorMobilePage.tsx`
(1 — `messages`), `TopHeader.tsx` (1 — `tenants.operators`, **coluna real**, fácil),
`SentimentMetricsCard.tsx` (1 — `ai_performance_logs`), `IntelligenceHubPage.tsx` (1 —
`users.role`, mesmo padrão do Sidebar/SuperAdminRoute — reusar `GET /api/v2/auth/me` já
criado na F1-D), `SandboxPage.tsx` (1 — `users`). `NetworkTwinPage.tsx` (1 — `network_ctos`)
**já pode ser corrigido direto** reaproveitando `GET /api/v2/rede/ctos` criada na F1-D (mesmo
padrão do `NetworkGraphPage.tsx`).
**Passos:** idênticos à F1-A (auditar schema real via MCP ANTES de escrever rota, migrar só o
que bate, documentar o resto). `ai_performance_logs` provavelmente repete o mesmo gap já
achado em `AIObservabilityPage.tsx`/`AIConfigPage.tsx` (campos como `escalated`, `agent`,
`active_flow`, `step`, `tool_called`, `provider` não existem na tabela real — é outro modelo
de dados) — confirmar antes de assumir, mas não gastar tempo tentando portar 1:1.
**Verificação/DoD:** mesmos da F1-A.

## [~] F1-EXTRA — Retomada de SettingsPage.tsx e ChatPage.tsx (pedido direto do Lucas,
2026-08-25, pós-F1-AUD)
**Modelo:** Claude Sonnet 5
**Contexto:** F1-C/F1-B tinham deixado SettingsPage.tsx (26 ocorrências) e ChatPage.tsx (6)
documentadas como bloqueadas por gap de schema. O Lucas pediu pra "rodar a F1-D2" nelas de
novo — reauditei ambas com o mesmo rigor (MCP antes de qualquer rota), e o resultado é
misto: uma parte real foi destravada, o resto continua genuinamente bloqueado (e achei 2
problemas novos, mais sérios que os documentados até aqui).

**✅ Corrigido — SettingsPage.tsx, 10 dos ~28 `supabase.from(` restantes:**
os 10 botões "Salvar X" de integrações (MK-Auth, RD Station, Pipedrive, HubSpot, RadiusNet,
Asaas, Gerencianet, Qdrant, Instagram, Facebook) gravavam em `tenants.integrations`, coluna
que não existe — **mas a própria página já tinha o padrão certo ao lado**: os botões de
Evolution/OpenAI/Gemini/Anthropic/SMTP/Clicksign/D4Sign já usavam
`apiPut('/api/v2/settings/integration-keys', { keys })`, rota real que grava em
`tenants.integration_keys` (jsonb, cifrado — `integration-secrets.routes.ts`, já existia).
Os 10 blocos foram alinhados ao mesmo padrão (`keys` só com os campos daquela integração,
try/catch/finally, refresh de `fetchIntegrationSecretsStatus()`). Fix mecânico, zero
schema novo, mesmo contrato já provado em produção pelos outros 7 provedores.

**✅ Corrigido — ChatPage.tsx, 1 das 6 ocorrências:** o formulário "Editar Cliente"
gravava `document`/`plan` (nomes que não existem — os reais são `cpf`/`plan_id`) via
Supabase anônimo. Criada `PUT /api/v2/customers/:id` (`customers.routes.ts`, allowlist
`name/email/phone/cpf/planId/status`, tenant-scoped) e `handleSaveCustomer` migrado.

**⛔ NÃO corrigido — SettingsPage.tsx, ~18 ocorrências restantes:** confirma o achado
original da F1-C, sem novidade — `sso_config`, `theme`, `vector_store_config` (duplicata do
gap já achado em AIConfigPage/KnowledgeBasePage), `monthly_token_limit`/`worker_concurrency`/
7 campos de `backup_*`, `holidays`, `role_permissions` (schema RBAC global, não por-tenant),
`cleanSettings` (spread de `companySettings` inteiro, mistura campos reais e inventados) —
nenhuma coluna real, precisa decisão de produto (criar coluna ou aposentar a feature) antes
de qualquer rota.
**✅ `cleanSettings`/`saveCompanySettings` RESOLVIDO (2026-08-27)** — ver detalhe na entrada
da F1-C acima (migration 119 + `PUT/GET /api/v2/settings/company`). Os demais deste
parágrafo (`sso_config`/`theme`/`vector_store_config`/limites de IA/`holidays`/
`role_permissions`) continuam sem decisão de produto — não fizeram parte do lote aprovado.
**Achado extra dentro deste grupo:** o comentário do próprio código em
`saveBackupConfig` (linha ~801) já admite que a seção de backup manual "nunca teve backend"
e é vestigial (Supabase já faz backup automático) — candidata a remoção, não a migração.
**✅ RESOLVIDO (2026-08-27)** — card "Backup Automático" removido inteiro da aba Avançado
(state `backupConfig`, handler `saveBackupConfig` e o `select` de colunas fantasma no
`useEffect` de limites); `monthly_token_limit`/`worker_concurrency` (mesmo `useEffect`,
gap diferente e ainda sem decisão) preservados intactos.
Também dentro deste grupo: `supabase.auth.mfa.enroll/challenge/verify` (linhas ~263-284) —
MFA via Supabase Auth, **sistema paralelo e morto**: o app tem seu próprio MFA real
(`apps/api/src/domain/auth/mfa.routes.ts`, TOTP, já funcional), então esta tela de setup de
MFA nunca funcionou e está desconectada do MFA de verdade.
**✅ RESOLVIDO (2026-08-27)** — aba "Segurança" inteira removida (trigger + `TabsContent`
+ state/handlers `startMfaEnrollment`/`confirmMfaEnrollment`/`totpFactorId`/etc.): não
sobrava nenhum outro conteúdo na aba depois de tirar o card morto. **Follow-up spawnado**
pra construir a UI real de 2FA (QR code) contra os endpoints já funcionais do
`apps/api/src/domain/auth/mfa.routes.ts` (`enroll`/`verify`/`disable` — hoje só `challenge`
tem consumidor no frontend, no login).

**⛔ NÃO corrigido — ChatPage.tsx, 5 ocorrências restantes:** todas em `messages`/`tickets`
com nomes que não existem (`ticket_id`/`body`/`sender_type`/`evo_msg_ids` em vez de
`conversation_id`/`content`/`role`/`from_ai`; `snoozed_until`/`snooze_reason`/`closing_reason`
em `tickets`, também inexistentes). **Isto não é um gap de nomenclatura simples — é um
modelo de dados diferente**, e o próprio cabeçalho do arquivo já documentava o motivo:
> "U4-01 — Inbox do Operador... Por ora usa `store.tickets` como fonte primária; **em S77
> a lista migrará para `GET /api/v2/conversations/inbox`**"

S77 é uma migração já planejada (tickets→conversations) e nunca executada — não é uma
tarefa desta sessão inventar essa decisão. `inbox.routes.ts` (P2-04) já é o backend real e
correto (`conversations` + `messages(content,role,extra,created_at)`), só não tem consumidor
no frontend ainda.

**🔴 Achado novo #1 (mais grave que tudo documentado até aqui) — realtime do ChatPage está
100% morto:** o arquivo conecta via `socket.io-client` (`io(url)`, eventos `join_chat`/
`typing_status`) a `http://localhost:3000`. O backend real (`apps/api/src/domain/realtime/
websocket.routes.ts`, BLOCO 7) é um **WebSocket nativo** (`@fastify/websocket`, não
Socket.IO) no canal `/ws/conversations/:conversationId`, protocolo de mensagens totalmente
diferente (`{type:'new_message',...}` via Redis pub/sub). **Não existe servidor Socket.IO
em lugar nenhum do `apps/api`** (grep confirma). Ou seja: além dos 6 `supabase.from(`
documentados, o ChatPage nunca recebe mensagem nova nem indicador de "digitando" em tempo
real — o socket.io-client conecta a nada. Isso é maior que o achado original da F1-B.
**✅ RESOLVIDO (commit `85a5850`, 2026-08-26, migration 116 `tickets.conversation_id`):**
realtime trocado pro WS nativo já existente (`/ws/conversations/:id`); socket.io-client
morto removido. Indicador de "digitando" via presence do WhatsApp foi cortado de
propósito (nunca teve canal real no backend). Ver `astrum-chatpage-messages-quebrado` na
memória do Claude Code.

**🔴 Achado novo #2 (bug de produção, worker já rodando) — `snooze.worker.ts` quebrado:**
`packages/queue/src/workers/snooze.worker.ts` (o worker "v2" que a L1 manteve como
substituto real do legado) faz `.select('id, tenant_id, snoozed_until, snooze_reason,
assigned_operator_id, snoozed_by')` em `tickets` — **nenhuma dessas 4 colunas existe**
(confirmado via MCP, schema idêntico ao já levantado). Esse worker roda a cada minuto em
produção (`snooze-check-repeat`); a query real do PostgREST rejeita coluna inexistente, ou
seja, **o cron do snooze provavelmente erra silenciosamente a cada execução** desde que foi
promovido a "v2 real" — precisa investigação separada (não confirmei o comportamento exato
do erro em runtime, só a incompatibilidade de schema).
**✅ RESOLVIDO (commit `f5fe51f`, 2026-08-26):** migration 115 criou as colunas reais; o
worker passou a usar `assigned_to` (coluna que já existia) em vez de `assigned_operator_id`;
nova rota `POST /api/v2/tickets/:id/snooze`. De brinde, corrigido no mesmo arquivo
(`tickets.routes.ts`): o PATCH `/api/v2/tickets/:id` não tinha `.eq('id', id)` — todo PATCH
atualizava TODOS os tickets do tenant. Ver `astrum-snooze-consertado` na memória.

**Verificação:** `typecheck:legacy` + `apps/api typecheck` limpos, build ok. Suites: root
**3505 passed / 0 failed** (isolado — timeout de sempre sob carga), apps/api **2755 passed /
0 failed** (isolado — mesmos 3 timeouts de sempre, 53/53 verde isolado). Testes novos:
`customers.routes.test.ts` (+4, cobrindo o PUT).

**Recomendação para o Lucas:** os dois achados novos (realtime morto + worker de snooze
quebrado) valem uma tarefa própria — não são "problema pequeno" nem cabem no escopo de uma
migração de página. O resto de SettingsPage/ChatPage precisa de decisão de produto (schema
novo vs. aposentar feature) antes de qualquer código.

## [x] F1-AUD — Auditoria dos lotes F1 antes do push
**Modelo:** Claude Sonnet 5 (2026-08-25)
**Resumo:** rodada **retroativa**, não no formato original da spec — `git log
origin/main..HEAD` deu vazio (F1-A/B/C/D/D2 já estavam 100% em produção, foram ao main
"de carona" em pushes de tarefas seguintes, não por um push formal auditado; ver "Estado
das frentes" no CLAUDE.md). Sem diff pra revisar, auditei o **código já em produção**
direto: levantei os 20 arquivos de rota criados/estendidos por F1-A/B/C/D/D2 via `git log
--grep "PLANO-100 F1-"` + `git show --stat` de cada commit, e as ~22 páginas/componentes
de frontend do inventário original.
- **(a) nenhuma rota aceita tenantId de fora do JWT / (b) supabaseAdmin + tenant_id / (c)
  fallback camelCase↔snake_case:** as 20 rotas lidas por completo (`billing-page`,
  `cobrai-page`, `dashboard`, `whatsapp-page`, `team-page`, `settings-page`,
  `quality-stats`, `knowledge-reindex`, `dlq`, `notifications`, `ai-config`, `customers`,
  `inventory-import`, `observability-data`, `graph`, `auth`, mais as 4 da própria F1-D2) —
  **todas** usam `getTenantId(req.user)` (helper da S3) + `supabaseAdmin` +
  `.eq('tenant_id', tenantId)`. Único desvio é **deliberado e documentado no próprio
  código**: `super-admin.routes.ts` não filtra por tenant porque É o painel cross-tenant,
  gateado só por `requirePermission('reports','admin')` — conferido que só `super_admin`
  tem essa permissão (`rbac.middleware.ts`, `admin` role só tem `reports:['read']`).
  `customers.routes.ts` merece nota: os sub-recursos (`/tickets`, `/service-orders`)
  filtram por `customer_id` **E** `tenant_id` juntos, não confiam só no `id` do path.
- **(d) zero `supabase.from(` restante nas páginas do lote (além do já documentado):**
  grep multi-arquivo nas ~22 páginas — sobraram ocorrências em 5 arquivos, **todas já
  documentadas** como gap de schema pré-existente (`ChatPage.tsx` 6, `WhatsAppPage.tsx` 2,
  `SettingsPage.tsx` 26, `KnowledgeBasePage.tsx` 2 — `embedding_config`/`vector_store_config`
  não existem; `AIConfigPage.tsx` 2 dessas 4 restantes idem). `SuperAdminRoute.tsx`/
  `Sidebar.tsx` "davam match" só por **comentário** citando o código antigo — zero código
  real restante ali.
- **(e)/(f) testes — 2 gaps reais achados e corrigidos no ato:**
  - `observability-data.routes.ts` (ragas-scores + guardrail-blocks, F1-D) **não tinha
    nenhum teste** — violação direta do DoD da F1-D ("toda rota nova tem teste"). Criado
    `observability-data.routes.test.ts` (10 testes: 401, filtro de tenant nos dois
    endpoints, não-vazamento cross-tenant, erro 500).
  - `report-metrics.routes.test.ts` (F1-D) testava a agregação e a sequência de tabelas
    consultadas, mas **nunca afirmava que o filtro de tenant foi aplicado** — um `.eq('id',
    ...)` trocado por engano passaria despercebido. Adicionada asserção `chain.eq
    toHaveBeenCalledWith('tenant_id', 'tenant-1')` nos 3 selects.
  - Nenhum teste existente foi enfraquecido ou skipado — só adições.
- **(g) suites:** `typecheck:legacy` + `apps/api typecheck` limpos; `npm run build` ok.
  `cd apps/api && npm test`: **2753 passed / 0 failed / 7 skipped**, exit 0 (rodada
  isolada, sem contenção de carga — inclusive os 4 arquivos que costumam dar timeout sob
  carga total passaram limpos desta vez).

**Achados colaterais — RESOLVIDOS em 2026-08-25 (mesmo dia, sessão seguinte, a pedido do
Lucas):**
- **✅ `AIConfigPage.tsx`, aba de uso de IA:** reaproveitado `GET /api/v2/ai-costs/logs`
  (já existia, criado na F1-D2) em vez do `supabase.from('ai_performance_logs')` direto.
  Render corrigido pra ler os campos reais (`tokens_in`/`tokens_out`/`ticket_id`/
  `created_at` ISO) em vez dos nomes Firestore-legado (`promptTokens`/`completionTokens`/
  `totalTokens`/`ticketId`/`createdAt.seconds`) que nunca existiram no schema Supabase.
  Os outros 3 `supabase.from('tenants')` da mesma página (campos `vector_store_config`/
  `monthly_token_limit`/`worker_concurrency`, sem coluna real) **continuam intocados** —
  gap de schema diferente, já documentado, fora do escopo deste fix.
- **✅ `Sidebar.tsx`, "Último acesso":** confirmado que `login.route.ts` grava
  `users.last_login_at` de verdade em todo login bem-sucedido (linha 47-51) — dado real,
  só faltava expor. `GET /api/v2/auth/me` ganhou o campo `lastLoginAt` (leitura extra em
  `users`, em paralelo com a leitura de `tenants.is_sandbox` já existente); `Sidebar.tsx`
  passou a consumir dali em vez de `supabase.auth.getSession()` (sessão sempre `null`,
  mesmo bug já corrigido em várias telas na F1-D2). `handleLogout` continua usando
  `supabase.auth.signOut()` — não é bug (idempotente/inofensivo mesmo sem sessão Supabase
  Auth ativa), só não fazia parte deste achado.
- Testes: `auth.routes.test.ts` reescrito pra mockar `tenants` E `users` separadamente
  (antes só mockava um `.from()` genérico) — 5 testes, incluindo `lastLoginAt: null`
  quando o usuário nunca logou. Suites completas verdes: `typecheck:legacy` + `apps/api
  typecheck` limpos, build ok, apps/api **2751 passed / 0 failed** (isolado — 3 timeouts
  sob carga total, mesmo padrão de sempre, 53/53 verde isolado), root **1 falha** (mesma
  familia, isolada também). Commit + push direto (fix pequeno, mesmo padrão de
  correção-no-ato desta tarefa).

**Push:** nada pendente de F1-A/B/C/D/D2 em si (já em produção). Os 2 arquivos de teste
corrigidos na auditoria e os 2 achados estruturais resolvidos depois foram commitados e
pushados direto (fix pequeno, mesmo padrão de correção-no-ato autorizada pela própria
spec desta tarefa).

<!-- Spec original abaixo, mantida para referência -->

**Modelo:** Claude Sonnet 5 *(rodar após CADA lote F1-A/B/C/D, ou após todos)*
**Objetivo:** garantir que os commits locais não-pushados da Fase 1 estão corretos.
**Passos:**
1. `git log origin/main..HEAD --oneline` para ver o que está pendente; revise o diff
   completo (`git diff origin/main..HEAD`).
2. Checklist da auditoria: (a) nenhuma rota nova aceita tenantId de fora do JWT;
   (b) todas usam `supabaseAdmin` + `.eq('tenant_id', ...)`; (c) leitura do JWT usa
   `tenantId ?? tenant_id`; (d) nenhum `supabase.from(` restante nas páginas do lote;
   (e) testes novos existem e testam o filtro de tenant de verdade (não só status 200);
   (f) nenhum teste foi enfraquecido/skipado; (g) suites completas verdes (rode você mesmo).
3. Problema pequeno: corrija no ato e anote. Problema estrutural: reporte ao Lucas e NÃO
   faça push.
4. Tudo ok → `git push` no main.
**DoD:** push feito (ou relatório de bloqueio), resumo da auditoria registrado aqui.

---

# FASE 2 — P0: Rollback do CobrAI quebrado

## [x] C1 — Option A na cobrança (repetir a decisão do atendimento)
**Modelo:** Claude Sonnet 5 (2026-08-25)
**Resumo:** Deletado `src/workers/cobraiWorker.ts` + teste exclusivo; `lockout.test.ts`
adaptado (removidos só os 2 testes do `processCobraiJob` legado, mantidos os 3 testes de
`tenantStatusMiddleware`, código vivo separado). `engine-flags.ts` perdeu
`getCobraiEngine`/`isCobraiEngineActive`/`shouldBootWorker`/`EngineTarget` (só sobrou
`isMultiAgentEnabled`, sem relação); `cobrai.worker.ts` sobe incondicional (como o
`message.worker`) e ganhou o freio de emergência real ANTES de qualquer `sendWhatsAppResponse`
(send_message/suspend_signal — para só o envio, não o resto do processamento: lockout,
invoice.paid, reactivate, notify_human continuam). Freio novo: tabela
`cobranca_emergency_stops` (migration `110_cobranca_emergency_stop.sql`, aplicada via MCP e
verificada — RLS on, policy `is_super_admin()`, grants corretos) + rota
`cobrai-emergency-stop.routes.ts` (GET/POST `/api/v2/cobranca/emergency-stop`, POST
`/api/v2/cobranca/emergency-resume`), reaproveitando as funções puras genéricas de
`emergency-stop.service.ts` (do atendimento) em vez de duplicar lógica. `cobrai-dispatch.routes.ts`/`.service.ts` simplificados: `buildCobraiEnqueue` não recebe mais
`engine` (só existe o shape v2 agora). `.env.example` e `CLAUDE.md` (R6 + tabela de flags)
atualizados. 12 testes Vitest novos/adaptados. Verificação: `npm run typecheck:legacy` e
`cd apps/api && npm run typecheck` limpos; `npm run test:unit` (suite completa, inclui
apps/api + packages/queue): 3483 passed / 7 skipped / **1 arquivo falhando**
(`apps/api/src/infrastructure/ai/batch.service.test.ts`) — **pré-existente, fora do escopo
desta tarefa** (WIP não commitado do S1, arquivo nunca tocado por mim; confirmado via
`git log` que o S1 já tem commit próprio `434fd65` e o bug de hoisting do mock já existia
antes desta sessão). Commit local (não incluí `package.json`/`package-lock.json` nem as
rotas de outras domains — cobrai-page/knowledge-reindex/dashboard/graph — que são WIP de
D1/F1-D em andamento em paralelo, não meus). Push direto no main após auto-revisão do diff
(autorizado pela spec desta tarefa).
**Achado colateral (não corrigido, fora do escopo):** as tabelas `atendimento_emergency_stops`
e `cobranca_emergency_stops` (esta e a migration 108) têm `authenticated` com grants
`TRUNCATE`/`DELETE`/`TRIGGER`/`REFERENCES` além de `SELECT`/`INSERT`/`UPDATE`, herdados de
`ALTER DEFAULT PRIVILEGES` do projeto — RLS cobre linhas mas `TRUNCATE` não é row-scoped,
então qualquer `authenticated` pode truncar a tabela hoje. Sistêmico do projeto (não
introduzido por esta migration), mesma categoria do achado da auditoria pré-prod de
2026-08-10. Relevante para a S2 (funções SECURITY DEFINER + tabelas deny-all).

<!-- Spec original abaixo, mantida para referência -->

**Modelo:** Claude Sonnet 5 *(mexe em cobrança — manter no Claude; NÃO dar ao DeepSeek)*
**Contexto:** `.env` de produção já roda `COBRAI_ENGINE=v2`. O worker legado
`src/workers/cobraiWorker.ts` não é bootado por ninguém (quem o bootava era o Express,
apagado na Fase 4 de 2026-08-17/18) — só os próprios testes o referenciam. Resultado:
`COBRAI_ENGINE=legacy` hoje NÃO reverte a cobrança antiga; apenas impede o worker v2 de
subir (guard em `packages/queue/src/workers/cobrai.worker.ts:261`) e nada sobe no lugar —
ou seja, desliga a cobrança inteira. É o mesmo defeito que o atendimento tinha e que foi
resolvido em 2026-08-23 pela "Option A" (deletar o legado e a flag; ver
`ATENDIMENTO_ENGINE` no CLAUDE.md e `engine-flags.ts`).
**Passos:**
1. Deletar `src/workers/cobraiWorker.ts` e seus testes
   (`src/__tests__/workers/cobraiWorker.test.ts`, `src/__tests__/workers/lockout.test.ts` —
   este último: apagar apenas se for exclusivo do worker legado; se testar coisa viva, adaptar).
2. Em `apps/api/src/infrastructure/config/engine-flags.ts`: remover
   `getCobraiEngine`/`isCobraiEngineActive`/`shouldBootWorker` e o tipo `EngineTarget`
   (conferir TODOS os callers antes: `cobrai.worker.ts`, `cobrai-guards.ts`,
   `cost-budget.ts`, `server.ts`, `drift.worker.ts` cita em comentário). O worker v2 passa
   a subir incondicionalmente (como o `message.worker` já faz).
3. Avaliar `apps/api/src/domain/cobranca/cobrai-guards.ts` e
   `apps/api/src/infrastructure/observability/cost-budget.ts`: remover só a dependência da
   flag, preservando qualquer outra lógica de guarda.
4. **Freio de emergência:** verificar se `emergency-stop.service.ts` (atendimento) cobre
   também a cobrança; se não, criar rota análoga `POST /api/v2/cobranca/emergency-stop`
   (mesmo padrão: estado no Supabase, checado pelo worker antes de ENVIAR mensagem de
   cobrança — parar de enviar, não de processar). Com teste.
5. Atualizar `.env.example` (remover `COBRAI_ENGINE`) e o CLAUDE.md (tabela de flags + R6
   — R6 vira: "uma engine só: v2; freio de emergência = emergency-stop").
6. Rodar suites completas (frontend + backend + `packages/queue`: `cd packages/queue && npx vitest run`).
**DoD:** flag e worker legado removidos, freio de emergência de cobrança existente e
testado, suites verdes, commit + push (esta tarefa é do Claude, push direto permitido
após auto-revisão do diff).

---

# FASE 3 — Dependências e vulnerabilidades

## [x] D1 — npm audit fix + bumps dirigidos
**Modelo:** DeepSeek V4 Pro (2026-08-25 — via OpenCode, executado pelo Lucas)
**Resumo:** 27 → 2 vulns (zero critical/high). `npm audit fix` (sem force) resolveu 20
via lockfile (tar 7.5.16→7.5.22 pelo override existente, axios 1.17→1.19,
find-my-way 9.6.0→9.9.0, fast-uri 3.1.2→3.1.6, ws/engine.io-client, socket.io-parser,
undici, js-yaml, ip-address, brace-expansion, body-parser, dompurify, protobufjs,
@opentelemetry/*). Bumps dirigidos: `nodemailer ^8.0.10 → ^9.0.5` (MAJOR avaliado: o
breaking do v9 é validar TLS por padrão ao buscar conteúdo remoto — os 3 usos do Astrum
são SMTP puro, sem fetch remoto/OAuth2/SES) e overrides `form-data ^4.0.4 → ^4.0.6` +
overrides ANINHADOS para `@getzep/zep-js` e `typed-rest-client` (qs ^6.15.2) — o zep-js
pina versões exatas vulneráveis (form-data 4.0.0 crítica, qs 6.11.2) e o override global
não era aplicado ao pin exato pelo npm 11 (bug de lockfile: foi preciso remover as 3
entradas aninhadas obsoletas do lockfile para o npm re-resolver com override — ver
achado). Sobrou só react-router/dom (moderate; fix exige 7.18.2, major com breaking no
frontend legado — justificado nos achados). Verificação: `npm run build` ok (15.9s),
`typecheck:legacy` exit 0, `apps/api typecheck` exit 0, frontend 3483 passed/7 skipped,
backend 2700 passed/7 skipped — única suíte falha é `batch.service.test.ts` (bug de
hoisting do vi.mock introduzido pelo commit S1 434fd65, rodado em paralelo a esta
tarefa; confirmado por run isolado e por diff — não é D1, ver achados). Commit local
5c1acc1 SEM push (aguarda AUD-G).
**Contexto:** `npm audit --omit=dev` acusa 27 vulnerabilidades (1 crítica `node-tar`;
highs: `nodemailer` (leitura de arquivo/SSRF), `find-my-way` (router do Fastify, DDoS
HTTP/2), `fast-uri`, `axios`, `undici`, `ws`, `form-data`, `socket.io-parser`,
`engine.io-client`, `js-yaml`, `ip-address`, `brace-expansion`, `@getzep/zep-js`).
**Passos:**
1. `npm audit fix` (SEM `--force`) na raiz. Registrar o que resolveu.
2. Para o que sobrar: bump dirigido no `package.json` certo (raiz ou `apps/api`) —
   priorize `fastify` (arrasta `find-my-way`/`fast-uri`), `nodemailer`, `axios`, `tar`.
   Um commit por grupo lógico.
3. NUNCA `npm audit fix --force` (quebra major sem controle). Se um fix exigir major
   bump com breaking change (ex.: Fastify major), registre em "Achados colaterais" e pule.
4. Rodar `npm run build` (Vite) + suites completas frontend e backend após CADA grupo de bumps.
5. `npm audit --omit=dev` final: colar o resumo no relatório (meta: zero critical/high,
   ou lista justificada do que sobrou).
**DoD:** vulnerabilidades critical/high zeradas ou justificadas uma a uma, suites + build
verdes, commits locais SEM push (aguarda AUD-G).

## [x] D2 — Enxugar as 84 dependências da raiz
**Modelo:** Claude Sonnet 5 (2026-08-25 — executado direto pelo Lucas em vez do DeepSeek,
mesma decisão da F1-B/C/D, ver nota de escopo abaixo)
**Resumo:** `npx depcheck` na raiz apontou 36 candidatas (28 `dependencies` + 8
`devDependencies`). Cruzei cada uma com uso real em `apps/api/src` (dependência hoisted
pelo workspace npm, consumida mesmo sem estar declarada no `apps/api/package.json`) e com
o próprio `apps/api/package.json` — achado: **9 das 36 apontadas como "unused" pelo
depcheck no root eram usadas de verdade pelo `apps/api`**: `@ai-sdk/openai` (5 arquivos),
`@aws-sdk/client-s3`/`@aws-sdk/s3-request-presigner` (`r2.adapter.ts`), `@fastify/etag`
(`server.ts`), `@sentry/profiling-node` (`sentry.service.ts`), `duckdb-async`
(`duckdb.service.ts`), `langsmith` (`langsmith.service.ts`), `pino-pretty` (transport do
`logger.ts`), `wrangler` (`wrangler.toml` real na raiz). Removê-las teria quebrado o build
do `apps/api` silenciosamente — ver "Achado colateral" abaixo. Restaram **13 candidatas
reais** com zero hits em código (só apareciam em `package.json`/lockfile/docs), resíduo do
backend Express morto desde a Fase 4 (2026-08-17/18): `@fastify/type-provider-typebox`,
`axios`, `cors`, `express-rate-limit`, `http-proxy-middleware`, `pino-http`,
`react-hook-form`, `swagger-jsdoc`, `swagger-ui-express` (9 `dependencies`) +
`@tanstack/react-query-devtools`, `@types/cors`, `@types/swagger-jsdoc`,
`@types/swagger-ui-express` (4 `devDependencies`). Removidas em 2 lotes (deps → devDeps),
com `npm install` + `npm run build` + `npm run test:unit` + `npm run typecheck:legacy` +
`cd apps/api && npm run typecheck` após cada lote — todos verdes. 46 pacotes removidos do
`node_modules` no lote 1, 5 no lote 2 (`npm install` sem erro nos dois). Build Vite ok nos
dois lotes; `typecheck:legacy` e `apps/api typecheck` limpos. Suítes: lote 1 bateu
exatamente a baseline conhecida do D1 (3483 passed/7 skipped, única falha pré-existente
`batch.service.test.ts`, bug de hoisting do S1); lote 2 teve 4 timeouts sob carga
(`SignupPage`, `langgraph.service`, `owasp-audit`, `bullmq.client`/`prompt-cache` — mesmo
padrão de flakiness já documentado desde a F1-A), confirmados não-relacionados por re-run
isolado (63/63 verde). Nenhuma dep citada em `apps/api/package.json` removida; nenhuma dep
de Vite/React/Tailwind tocada. Commit local, SEM push (aguarda AUD-G).

**Nota de escopo — grep ampliado além do prescrito na spec (regra global 2: divergência
reportada, não improvisada):** o passo 1 pedia
`grep -rn "<pacote>" --include="*.ts" --include="*.tsx" src scripts vite.config.ts vite.preview.config.mts`
— esse escopo não cobre `apps/api/src`. Como o monorepo usa npm workspaces com um único
`node_modules` hoisted, uma dependência pode estar declarada só no `package.json` da raiz e
ser consumida de verdade pelo `apps/api` sem aparecer no `apps/api/package.json` — foi
exatamente o caso das 9 dependências listadas acima. Segui o grep literal primeiro, mas
antes de editar qualquer coisa ampliei a busca pro repo inteiro (incluindo `apps/api/src`)
porque a regra "Proibido: remover dep citada em `apps/api/package.json`" só cobre metade do
risco real — a outra metade é dependência hoisted não declarada. Sem isso, o lote 1 teria
quebrado o build do `apps/api` (imports de `@aws-sdk/*`, `@ai-sdk/openai`, `langsmith`,
`duckdb-async`, etc. deixariam de resolver).

**Contexto:** o `package.json` da raiz tem 84 deps de produção — muitas eram do backend
Express, morto desde 2026-08-17/18 (ex. prováveis: socket.io, cheerio, nodemailer na
raiz — nodemailer vivo existe no `apps/api`). Dep morta = superfície de ataque e npm
audit sujo de graça.
**Passos:**
1. Rode `npx depcheck` na raiz e analise o resultado com ceticismo (depcheck erra com
   imports dinâmicos/vite). Para CADA dep candidata a remoção, confirme com
   `grep -rn "<pacote>" --include="*.ts" --include="*.tsx" src scripts vite.config.ts vite.preview.config.mts` (zero hits reais = remove).
2. Remova em lotes de ~10, rodando `npm install` + `npm run build` + `npm run test:unit`
   + `npm run typecheck:legacy` após cada lote. Se algo quebrar, devolva a dep e anote.
3. Deps usadas SÓ por `scripts/` podem virar devDependencies.
**Proibido:** remover qualquer dep citada em `apps/api/package.json` (não é escopo);
tocar em deps do Vite/React/Tailwind sem hit zero comprovado.
**DoD:** raiz enxuta com justificativa por remoção no relatório, build + suites verdes,
commit local SEM push (aguarda AUD-G).

## [x] AUD-G — Auditoria geral dos lotes D1/D2/S3/L1 + push
**Modelo:** Claude Sonnet 5

> **PASSE 1 — 2026-08-25, Claude Opus 5: D1 AUDITADA, APROVADA E PUSHADA.** A tarefa segue
> aberta porque D2/S3/L1 ainda não foram executadas (quando forem, roda um passe 2).
>
> Auditado o range `origin/main..HEAD` (4 commits: `5c1acc1` D1 + `f985679` doc D1 +
> `010cca1` I1 + `db19c87` S2). **Toda a verificação rodou num git worktree isolado do
> HEAD**, porque a árvore de trabalho tem WIP não commitado da D2 (remoção de 13 deps) que
> contaminaria o resultado — auditar o commit exige testar o commit, não a árvore.
> - **(a) major sem registro:** só 2 majors no lockfile. `nodemailer 8.0.10→9.0.5` está
>   registrado E a justificativa se confirma — os 3 usos (`email.adapter.ts`,
>   `src/lib/email.ts`, `siteScrapeWorker.ts`) são SMTP puro com host/port/auth, e o único
>   anexo (`reportWorker.ts:156`) usa `content` base64 inline, não `path` remoto: o breaking
>   do v9 (validar TLS ao buscar conteúdo remoto) não toca em nada. `miniflare
>   4.20260603.0→5.20260820.0-alpha` **não é decisão da D1**: é dev-only (`dev: true`,
>   fora do `--omit=dev`) e vem pinado pelo próprio `wrangler`, que subiu 4.98.0→4.125.0
>   dentro do range `^4.98.0` já declarado. Registrado aqui para não parecer major escondido.
> - **(b) dep removida que aparece em grep:** não se aplica à D1 (só bumps, zero remoções).
>   Ver o bloco da D2 logo abaixo — ela entrou no mesmo push.
> - **(c) lockfile coerente:** `npm ci` do zero **exit 0** (1414 pacotes). `npm audit
>   --omit=dev` = **2 moderate / 0 high / 0 critical**, batendo com o relatório da D1 (os 2
>   são o react-router, pulado com justificativa). E a checagem que a própria D1 pediu:
>   as entradas aninhadas vulneráveis **NÃO voltaram** — `@getzep/zep-js/node_modules/
>   {form-data,qs}` e `typed-rest-client/node_modules/qs` não existem no install limpo, e o
>   override resolveu para `form-data@4.0.6` + `qs@6.15.3` deduplicados no topo.
> - **teste enfraquecido/skipado:** nenhum — os 4 commits não tocam **nenhum** arquivo de
>   teste nem de código (só `package.json`, `package-lock.json`, 2 docs e a migration 113).
> - **suites:** `typecheck:legacy` exit 0, `apps/api typecheck` exit 0, `npm run build`
>   exit 0. `npm run test:unit` acusou 4 falhas, TODAS provadas alheias a estes commits:
>   `langgraph.service.test.ts` (2) e `owasp-audit.test.ts` (1) passam isoladas
>   (**48/48 verde**) — é a flakiness de timeout sob carga total já documentada na
>   F1-B/C/D; e `batch.service.test.ts` é o bug de hoisting do `vi.mock` herdado do commit
>   S1 `434fd65`, **já em `origin/main`** (arquivo idêntico ao main, erro estático de TDZ,
>   sem relação com dependência). Ou seja: o `main` já estava vermelho antes destes commits.
> - **correção no ato** (AUD-G autoriza para problema pequeno): `batch.service.test.ts`
>   passou a usar `vi.hoisted()` para o mock do `supabaseAdmin` — 3 linhas, sem enfraquecer
>   asserção nenhuma (as duas `expect(supabaseFrom).toHaveBeenCalledWith(...)` seguem
>   valendo). **7/7 verde.** Com isso o `main` volta a ficar verde.
> - **Veredito: push feito.** D1/I1/S2 + o fix do teste subiram para o main.
>
> **⚠️ Correção de registro — a D2 entrou neste push, e eu não a peguei antes de empurrar.**
> Quando levantei o estado da árvore, as 13 remoções da D2 estavam NÃO commitadas, e foi por
> isso que isolei a verificação num worktree (para não misturar). Só que o commit `ec2657c`
> (D2, `LucasNotur`, 16:56) nasceu **durante** a janela da auditoria, o meu commit de
> fechamento foi criado em cima dele e o `git push` — que é do branch inteiro, não dos
> commits que eu escolhi — levou a D2 junto. Eu deveria ter reconferido
> `git log origin/main..HEAD` imediatamente antes do push; não reconferi. A DoD da D2 pedia
> "commit local SEM push (aguarda AUD-G)", então ela foi para o main antes da auditoria.
> **Auditei logo depois, no estado exato que foi pushado (`a6dc9cb`), e o resultado é
> aprovação** — mas na ordem errada, o que fica registrado aqui em vez de escondido:
> - **(b) dep removida que aparece em grep — PASSA.** Nenhum dos 13 pacotes removidos
>   (`@fastify/type-provider-typebox`, `axios`, `cors`, `express-rate-limit`,
>   `http-proxy-middleware`, `pino-http`, `react-hook-form`, `swagger-jsdoc`,
>   `swagger-ui-express`, `@tanstack/react-query-devtools` + 3 `@types`) tem uma única
>   importação real no repo — os únicos hits são exemplos em markdown de `.claude/skills/`.
>   Conferidos os quase-homônimos que poderiam enganar um grep frouxo: `apps/api/src/server.ts`
>   importa **`@fastify/cors`** (declarado no `apps/api/package.json`), não o `cors` do Express;
>   a raiz manteve **`@tanstack/react-query`** (só o *devtools* saiu) e **`pino`**/`pino-pretty`
>   (só o `pino-http`, middleware de Express, saiu). Nenhum caso de dep hoisted usada por
>   `apps/api` sem estar no package.json dele — a armadilha que o próprio autor da D2 diz ter
>   filtrado (9 falsos positivos do depcheck).
> - **(c) lockfile coerente — PASSA.** `npm ci` do zero no estado pushado: **exit 0**, 1363
>   pacotes (51 a menos que antes da D2, coerente com 13 deps + transitivas exclusivas).
>   `npm audit --omit=dev` segue **2 moderate / 0 high / 0 critical**.
> - **(a) major sem registro:** não se aplica (a D2 não faz bump).
> - **suites no estado pushado (`a6dc9cb`):** `typecheck:legacy` exit 0, `apps/api typecheck`
>   exit 0, `npm run build` exit 0. `npm run test:unit`: **3482 passed / 7 failed / 7 skipped**.
>   As 7 falhas passam **todas** em execução isolada (`langgraph`+`owasp-audit`: 48/48;
>   `erp-admin`+`campaigns`+`sandbox`+`synthetic`: 52/52) — é a mesma flakiness de timeout sob
>   carga total já documentada na F1-B/C/D, e não quebra da D2: uma dep faltando de verdade
>   reprovaria no typecheck/build ou falharia igual isolada. O `batch.service.test.ts` que
>   estava vermelho no `main` saiu da lista (corrigido neste mesmo passe).
> - **Veredito da D2: aprovada em auditoria pós-push.** Nenhuma ação corretiva necessária.

> **PASSE 2 — 2026-08-25, Claude Sonnet 5: L1/L2 AUDITADOS, APROVADOS E PUSHADOS.**
> Range auditado: `origin/main..HEAD` = 3 commits (`4589ad9` L1, `ab0345f` + `23f0bb8` L2).
> `origin/main` estava em `3dfbbfa` (B1, já pushada — fora do escopo desta tarefa, que é
> D1/D2/S3/L1; S3 segue não executada, só WIP não commitado na árvore). **Toda a
> verificação rodou num worktree isolado (`git worktree add`) do HEAD**, pelo mesmo motivo
> do Passe 1: a árvore de trabalho tem WIP não commitado e enorme da S3 (86 rotas +
> `apps/api/src/lib/jwt-claims.ts` novo) que a própria L1 já tinha registrado como culpado
> por 26 falhas de teste e 44 erros de typecheck durante a sua verificação — não dava pra
> confiar num resultado rodado em cima disso. `node_modules` (raiz e `apps/api`) reaproveitados
> via junction (NTFS) em vez de `npm install`, porque `git diff origin/main..HEAD` confirma
> zero mudança em `package.json`/`package-lock.json` nos 3 commits — instalar de novo não
> mudaria nada e só gastaria tempo.
> - **Diff revisado por completo:** só deleções de código morto + testes órfãos (32 arquivos,
>   -6.981/+88 linhas) e edição de docs (`CLAUDE.md`, o próprio plano). Nenhuma mudança de
>   dependência, nenhuma rota nova, nenhum arquivo de produção tocado além das deleções.
> - **Alvos da L1 — zero importer real restante.** Regrep de cada nome-base
>   (`gemini.server`, `toolRegistry`, `tenantGuard`, e os 9 workers) no worktree: os únicos
>   hits são falsos-positivos de substring (ex.: variável local `tenantGuardWarned` em
>   `src/lib/db-compat/firestore.ts`; nomes dos workers v2 em `apps/api`/`packages/queue`,
>   que são implementações diferentes, não importam os arquivos deletados).
> - **Lista "NÃO deletar" respeitada:** `apps/frontend/`, `src/repositories/`,
>   `src/middleware/` intactos; `src/ai-provider/` **não** foi deletado (confirmado presente),
>   batendo com o achado colateral registrado pela própria L1 (importador vivo via
>   `embeddingProvider.ts` ← `dbAdmin.ts`). `src/lib/wizard.ts` citado na spec como "não
>   deletar" não existe no repo (não é arquivo tocado por este diff — préexistente, fora do
>   escopo desta auditoria).
> - **Teste enfraquecido/skipado:** nenhum. Os 10 testes de `src/__tests__/workers/`
>   removidos são exclusivos dos workers deletados (confirmado pelo diff: cada teste some
>   junto com o worker que testa); `lockout.test.ts` continua intacto (testa
>   `tenantStatusMiddleware`, código vivo, como a L1 registrou).
> - **Suites no worktree isolado (sem contaminação da S3):** `npm run typecheck:legacy`
>   exit 0; `cd apps/api && npm run typecheck` exit 0; `npm run build` (Vite) exit 0 (só
>   warnings pré-existentes de code-splitting, nada do diff). `npm run test:unit`
>   (raiz): **3457 passed / 7 skipped, 0 falhas**, exit 0 — bate exatamente com a baseline
>   conhecida (3483 passed/7 skipped) menos os 26 testes órfãos removidos pela própria L1.
>   `cd apps/api && npm test`: 4 arquivos falharam por timeout sob carga total
>   (`langgraph.service.test.ts`, `replay.routes.test.ts`, `prompt-cache.service.test.ts`,
>   `owasp-audit.test.ts`) — mesma flakiness já documentada desde F1-B/C/D; **os 4 rodados
>   isolados: 60/60 verde.** Nenhum dos 4 arquivos aparece no diff `origin/main..HEAD`
>   (confirma que não é regressão da L1/L2). Isso também confirma, por comparação direta, que
>   os "26 falhas / 44 erros de typecheck" que a própria L1 relatou durante a sua verificação
>   eram mesmo 100% da S3 WIP contaminando a árvore — sumiram por completo no worktree limpo.
> - **L2 (`CLAUDE.md`):** diff mínimo e cirúrgico (34 inserções/7 remoções, 5 trechos: R1,
>   R3, data da seção "Estado das frentes", bloco novo de resultado das Fases 1-5, fonte da
>   verdade nova). Conteúdo conferido contra a realidade verificada nesta auditoria: R3
>   ("cumprida", `src/ai-provider/` não deletado) bate com o achado da L1 acima; "Fase 5...
>   ainda aguardando push pela auditoria geral" ficou desatualizado pelo push desta própria
>   tarefa — não veio reescrito aqui porque a doc reflete o estado no momento do commit L2
>   (correto para aquele commit); quem ler depois deste push já vê a S3 pendente citada
>   corretamente na "Fase 4".
> - **Veredito: push feito.** L1 + L2 (`4589ad9`, `ab0345f`, `23f0bb8`) subiram para o main.
>   Com isso a Fase 5 do plano está completa e pushada; falta só a S3 (Fase 4) para fechar
>   tudo que esta tarefa cobria (D1/D2/S3/L1 — D1/D2 já tinham sido pushados no Passe 1).

> **PASSE 3 — 2026-08-25, Claude Sonnet 5: S3 AUDITADA, APROVADA E PUSHADA (com a F1-D2 de
> carona).** Range auditado: `origin/main..HEAD` = 3 commits (`7065e15` S3, `61fd64c` +
> `d1ffbae` F1-D2 — os 2 últimos não fazem parte do escopo original desta tarefa, mas
> entraram no mesmo push porque `git push` sobe o branch inteiro; mesma situação já
> registrada no Passe 1 com a D2). `origin/main` estava em `cca1ac7` (fix das 4 rotas
> quebradas + F1-D — pushado direto numa sessão anterior deste mesmo dia, fora do fluxo
> AUD-G por pedido explícito do Lucas). Árvore de trabalho estava limpa no início desta
> auditoria (sem WIP concorrente) — não precisou de worktree isolado desta vez.
> - **Diff revisado (140 arquivos, +1598/-754):** o grosso é a S3 — troca mecânica de
>   `user.tenantId`/`(request as any).user.tenant_id`/desestruturação `{tenantId, userId} =
>   user` por `getTenantId(user)`/`getUserId(user)` em ~90 arquivos de rota, todas
>   idênticas no padrão (amostrado `inbox.routes.ts`, `mfa.routes.ts`, `field-ops.routes.ts`
>   — o maior diff individual, 33 trocas — todas seguem exatamente o mesmo molde, sem
>   surpresa). O resto é a F1-D2 (já detalhada na seção própria acima).
> - **S3 — DoD conferido item a item:**
>   - Helper testado: `jwt-claims.test.ts` cobre camelCase, snake_case, ambos (precedência
>     camelCase), nenhum, string vazia, `null`/`undefined`, valor não-string — pra
>     `getTenantId` E `getUserId` (incluindo fallback `uid`→`sub`), acima do mínimo pedido.
>   - Zero leituras diretas restantes — grep prova: `user\.tenantId|user\.tenant_id` (várias
>     variantes de acesso) em `apps/api/src/**/*.routes.ts` = **0 ocorrências reais** (só um
>     comentário em `inbox.routes.ts`); `req.user?.tenantId` etc. também zero.
>   - Regra ESLint ativa: `no-restricted-syntax` em `apps/api/eslint.config.mjs`, com
>     exceção correta pro próprio helper e pro `login.route.ts` (onde `user` é a linha da
>     tabela, não claim do JWT). `npx eslint src` direto (sem o wrapper `rtk`) dá **0
>     errors, 1185 warnings** (warnings são `no-explicit-any`/`no-unused-vars`
>     pré-existentes, tolerados por design — "warn primeiro" no próprio `eslint.config.mjs`).
>     ⚠️ **Achado à parte:** `npm run lint` (que passa pelo hook/proxy `rtk`) relatou "6
>     errors, 1379 warnings" — número diferente e não reproduzido rodando `eslint`/`npx
>     eslint src` puro duas vezes seguidas (sempre 0 errors). Não investiguei a fundo o
>     porquê (fora do escopo desta auditoria), mas é motivo pra **não confiar cegamente no
>     `npm run lint` via `rtk` como fonte de verdade** — rodar `npx eslint src` direto se
>     precisar decidir algo em cima do resultado.
>   - Suite backend completa verde: nenhum teste weakened/skipado (diff só troca a
>     extração de `tenantId`/`userId`, nunca uma asserção).
> - **Suites (raiz + apps/api), rodadas no HEAD real (árvore limpa, sem worktree):**
>   `typecheck:legacy` exit 0; `apps/api typecheck` exit 0; `npm run build` (Vite) ok, só
>   warnings pré-existentes de code-splitting. `npm run test:unit`: **1 falha**
>   (`owasp-audit.test.ts`, timeout 30s) — mesma flakiness sob carga já documentada desde
>   F1-B/C/D. `cd apps/api && npm test`: **3 falhas** (`langgraph.service.test.ts`,
>   `prompt-cache.service.test.ts`, `owasp-audit.test.ts`, todas timeout) — os 3 rodados
>   isolados: **53/53 verde**. Nenhuma das 4 falhas está relacionada aos arquivos do diff.
> - **Veredito: push feito.** S3 (`7065e15`) + F1-D2 (`61fd64c`, `d1ffbae`) subiram para o
>   main. Com isso **D1/D2/S3/L1 estão 100% completos e pushados** — a AUD-G original
>   (D1/D2/S3/L1) está encerrada. F1-D2 sobe também, mas a F1-AUD (auditoria formal da
>   Fase 1 inteira: F1-A/B/C/D/D2) segue **pendente** — o código já está em produção "de
>   carona" desde a F1-A, não por push formal auditado (ver "Estado das frentes" no
>   CLAUDE.md e "ACHADOS COLATERAIS" abaixo).

Mesmo protocolo da F1-AUD (diff completo de `origin/main..HEAD`, rodar suites, procurar
teste enfraquecido, push se ok). Checklist extra: (a) nenhum bump de major sem registro;
(b) nenhuma dep removida que aparece em grep; (c) lockfile coerente (`npm ci` limpo).

---

# FASE 4 — Segurança fina

## [x] S1 — [MCP] Auditoria dos 5 arquivos com client Supabase anônimo no apps/api
**Modelo:** Claude Sonnet 5 no Claude Code (2026-08-25)
**Resumo:** Confirmado via MCP (`information_schema.role_table_grants`) que `anon` tem
**zero grants** nas 7 tabelas tocadas pelos 5 arquivos (`webhook_deliveries`, `tenants`,
`customers`, `tickets`, `safety_vetoes`, `ai_batch_jobs`, `churn_predictions` — só
`authenticated` tem grant; `anon`, nenhum). **4 dos 5 arquivos usavam de fato o client
anônimo** e foram corrigidos (troca de import para `supabaseAdmin`, diff de 1 linha por
arquivo, mesmo padrão de `trial.service.ts`/`tenant-keys.ts`):
- `svix.service.ts` — **QUEBRADO_SILENCIOSO**. `send()` insere em `webhook_deliveries` sem
  checar `error`; `_getOrCreateApp()` falha ao ler `tenants.svix_app_id` (trata como "sem
  app" e recria um app novo no Svix a cada chamada — duplicação de recurso externo) e falha
  ao persistir o `app_id` novo (idem, silencioso). Só `resendDelivery()` já checava `error`
  (mas lançava "entrega não encontrada" quando na verdade era erro de permissão).
- `agent-db.adapter.ts` — **QUEBRADO_SILENCIOSO**. É a implementação de `IDatabasePort`
  usada pelo grafo do agente de IA (`domain/agent/agent.nodes.ts`, caminho vivo de
  produção). `fetchCustomer`/`createTicket`/`recordSafetyVeto` não checavam `error`: cliente
  sempre voltava `null` pro agente, tickets criados pela IA nunca eram gravados, e vetos de
  segurança (IA-21 — fila de revisão humana quando o classificador bloqueia uma resposta)
  nunca eram registrados.
- `batch.service.ts` — **QUEBRADO_SILENCIOSO**. Chamado de verdade pelo worker BullMQ
  (`packages/queue/src/workers/batch.worker.ts`, não é código morto). Toda leitura
  (`customers`, `tickets`) e escrita (`ai_batch_jobs`, `churn_predictions`) sem checar
  `error`: a análise de churn e a classificação de tickets agendadas às 02h nunca rodavam de
  fato (lista sempre vazia) e o audit log de jobs nunca era persistido.
- `zep.service.ts` — **QUEBRADO_SILENCIOSO**, impacto menor. `_ensureSession()` lê
  `customers.name/email` sem checar erro; ao falhar, a sessão Zep é criada sem nome/email
  do cliente nos metadados (degrada qualidade da memória de longo prazo, não quebra o fluxo
  — Zep é fail-open por design).

O 5º arquivo, `vendas-dashboard.routes.ts`, é **INOFENSIVO**: o import é
`supabaseAdmin as supabase` (alias local) — bateu no grep por causa do nome da variável,
mas nunca usou o client anônimo de fato; nenhuma mudança necessária.

15 testes Vitest novos/atualizados mockando `supabaseAdmin` (mesmo padrão de
`tenant-keys.test.ts`): 2 arquivos novos (`svix.service.test.ts`,
`agent-db.adapter.test.ts`) + testes adicionados em `batch.service.test.ts` e
`zep.service.test.ts` (mock existente ali trocado de `supabase` para `supabaseAdmin`, já
que a chave mockada tinha o nome errado desde antes). Suite backend completa: **2687
passed / 3 failed / 7 skipped** — as 3 falhas são em `cobrai-dispatch.service.test.ts`,
arquivo **não tocado por esta tarefa**: já estava modificado (não commitado) no início desta
sessão, junto com `engine-flags.ts`, `cobrai-page.routes.ts`, `cobrai.worker.ts`,
`dashboard.routes.ts`, `graph.routes.ts`, `knowledge-reindex.routes.ts`, `server.ts` e a
deleção de `src/workers/cobraiWorker.ts` — trabalho em andamento de outra tarefa (padrão
bate com a C1, Fase 2), não desta S1. Ver "Achados colaterais". Commit + push feitos **só
dos arquivos do escopo S1** (4 arquivos corrigidos + 2 testes novos + este plano); o resto
da árvore de trabalho ficou intocado, como estava antes desta sessão.
**Contexto:** o bug do /trial (2026-08-24) era o client anônimo gravando com RLS
bloqueando silenciosamente. Já corrigidos: `trial.service.ts`,
`integration-secrets.routes.ts`, `tenant-keys.ts`. Restam 5 arquivos não-teste importando
`{ supabase }` de `apps/api`: `adapters/webhooks/svix.service.ts`,
`domain/vendas/vendas-dashboard.routes.ts`, `infrastructure/adapters/agent-db.adapter.ts`,
`infrastructure/ai/batch.service.ts`, `infrastructure/memory/zep.service.ts`.
**Passos, para CADA arquivo:**
1. Listar cada operação (`.from('<tabela>').select/insert/update/delete`).
2. Via MCP, conferir a RLS da tabela: `select * from pg_policies where tablename='<t>';`
   e os grants do `anon`. Como `anon` tem zero grants hoje, QUALQUER operação via client
   anônimo falha — a pergunta é se o código trata o erro ou engole.
3. Veredito por arquivo: `QUEBRADO_SILENCIOSO` (trocar para `supabaseAdmin`, checando
   `error` no retorno), `QUEBRADO_COM_ERRO_VISIVEL` (trocar idem) ou `INOFENSIVO`
   (ex.: código morto — provar).
4. Aplicar as trocas, adicionar teste de regressão por arquivo corrigido (mockando o
   client como os testes de `trial.service` fazem).
**DoD:** 5 arquivos auditados com veredito escrito aqui, correções testadas, suite
backend verde, commit + push (tarefa Claude, auto-revisão).

## [x] S2 — [MCP] Funções SECURITY DEFINER + tabelas deny-all
**Modelo:** Claude Opus 5 no Claude Code (2026-08-25)

**Resumo/DECISÃO:** advisors de segurança: **3 WARN → 2** e **5 INFO → 0**. Migration
`113_s2_secdef_rpc_surface_e_denyall.sql` aplicada via MCP (idempotente).

*Funções SECURITY DEFINER — o mapeamento do passo 1 mudou a resposta óbvia:*
- **`get_tenant_id()` — EXECUTE MANTIDO para `authenticated` (WARN aceito).** É chamada
  por ~120 policies `{public}` + 4 policies `{authenticated}` de `storage.objects` (bucket
  privado `uploads`) e, sobretudo, é o alicerce do **caminho vivo MT-02(c)**:
  `withTenantRLS()` (`apps/api/src/infrastructure/database/tenant-rls.ts`) faz `SET LOCAL
  ROLE authenticated` + `set_config('app.current_tenant', ...)` de propósito — usado hoje
  por LGPD, DLQ, voice, OCR-review, anomaly, metrics-ingest e HSM. Revogar não endureceria
  nada: **quebraria a própria defesa em profundidade + o Storage**, e silenciosamente (a
  query inteira falha por permissão dentro da policy). Exposição via RPC é inócua: devolve
  o tenant do PRÓPRIO chamador; o fallback por GUC não é setável pelo cliente PostgREST.
- **`is_super_admin()` — EXECUTE MANTIDO para `authenticated` (WARN aceito).** 12+ policies
  `{public}` a chamam, OR'd com a policy de tenant, em tabelas alcançadas pelo caminho
  `authenticated` (`hsm_templates`, `hsm_send_logs`, `departments`, `daily_metrics`,
  `users`...). Via RPC devolve booleano sobre o próprio chamador e ainda exige AAL2 quando
  há MFA (migration 106).
- **`has_permission(text,text)` — EXECUTE REVOGADO de `authenticated`.** Única das 3 sem
  NENHUM uso: zero policies a referenciam (varredura em `pg_policies`), zero
  views/funções/triggers/defaults/checks dependem dela (consulta de dependências) e zero
  chamadas no código (só migrations e docs a citam). Existia só como endpoint RPC — e como
  oráculo sobre `role_permissions`, tabela deny-all que o usuário não lê direto.
  `service_role`/`postgres` mantêm EXECUTE (confirmado), então uso futuro pelo backend
  segue funcionando.
- `anon` **já não tinha** EXECUTE em nenhuma das 3 (revogado na 092) — o passo 3 da spec
  sobrava só para `authenticated`.

*Tabelas deny-all (passo 4) — deny-all é intencional, mas não estava sendo entregue:*
as 5 (`legacy_docs`, `node_latency_daily`, `outbox`, `role_permissions`,
`schema_migrations`) são acessadas só por `service_role`/owner — confirmado por grep:
`personas.routes.ts` + `src/lib/db-compat/firestore.ts` (supabaseAdmin), `ia/latency.routes.ts`
(supabaseAdmin), `outbox.service.ts` (client de servidor — ver achado colateral),
`has_permission()` (SECURITY DEFINER, roda como owner) e `packages/db/src/migrate.ts`
(conexão pg direta). **Porém**: todas ainda tinham GRANT de SELECT/INSERT/UPDATE/DELETE **e
TRUNCATE** para `authenticated`, herdado de `ALTER DEFAULT PRIVILEGES` (mesmo achado da C1,
agora confirmado como sistêmico). **TRUNCATE não é row-scoped — a RLS não o cobre**, então
o "deny-all" era só aparente. Provado no banco antes da migration:
`has_table_privilege('authenticated','public.outbox','TRUNCATE')` = **true**. A 113 fecha no
nível de GRANT (`REVOKE ALL ... FROM anon, authenticated`) e registra o deny-all como policy
explícita `deny_all_non_service` (`USING (false)`), encerrando os 5 INFO do advisor.

**Verificação (SQL contra o banco real, antes e depois — não é mock):**
| Checagem (role `authenticated`) | antes | depois |
|---|---|---|
| `get_tenant_id()` resolvido via GUC | tenant ok | **tenant ok** |
| customers do tenant / de outro tenant | 60 / **0** | 60 / **0** |
| `hsm_templates` (exercita `is_super_admin()` na policy) | ok | **ok** |
| `TRUNCATE outbox` / `TRUNCATE schema_migrations` | **true** | **false** |
| `SELECT role_permissions` | true | **false** |
| EXECUTE `has_permission` (authenticated / service_role) | true / true | **false** / true |
| EXECUTE `get_tenant_id`, `is_super_admin` | true | **true** (intencional) |

`service_role` mantém SELECT/INSERT nas 5 tabelas (verificado). Advisors re-rodados via MCP:
`rls_enabled_no_policy` **0** (era 5), `authenticated_security_definer_function_executable`
**2** (era 3). Sobra 1 WARN não relacionado (`auth_leaked_password_protection` — toggle do
painel Auth, fora do escopo, anotado nos achados). Nenhum código TypeScript mudou, então não
há suíte aplicável — a prova de não-regressão é o teste ao vivo acima (mais forte que os
mocks: bate no schema/policies reais).

**Divergência da spec (regra global 2, reportada não improvisada):** a spec pedia
"numeração sequencial — próxima livre após a 112", mas o maior número no repo E no banco era
**110** (111/112 nunca existiram). Usei **113** como a spec manda literalmente, deixando
111/112 livres; o runner (`migrate.ts`) ordena por nome de arquivo e rastreia por filename,
então o buraco é inofensivo.

**Push NÃO feito (decisão do Lucas, 2026-08-25).** A DoD da S2 pedia "commit + push", mas o
`main` local tinha 3 commits não pushados de outras tarefas — entre eles o `5c1acc1` (D1,
bumps de dependência) que diz explicitamente "SEM push (aguarda AUD-G)". `git push` levaria
todos junto, furando a auditoria que a própria D1 pediu. Reportado antes de agir (regra
global 2); o Lucas escolheu segurar. **A migration 113 já está aplicada no banco de produção**
(via MCP, como a spec autoriza) — só o arquivo `.sql` + este resumo aguardam o push do AUD-G;
nada fica inconsistente. Commit local: `06517f1`.

<!-- Spec original abaixo, mantida para referência -->

**Modelo:** Claude Opus 5 ou Fable 5 no Claude Code *(análise delicada de RLS em produção)*
**Contexto:** o advisor do Supabase aponta 3 funções SECURITY DEFINER executáveis por
`authenticated` via PostgREST RPC: `get_tenant_id()`, `has_permission()`,
`is_super_admin()`. **CUIDADO — armadilha conhecida:** policies RLS com `roles={public}`
(ex.: `super_admin_all` em `dead_letter_queue`, `tenant_isolation` em `users`) chamam
essas funções no `qual`; revogar EXECUTE de um role que ainda passa por essas policies
faz a query INTEIRA falhar para aquele role. Antes de revogar, mapear:
1. `select tablename, policyname, roles, qual from pg_policies where qual ilike '%is_super_admin%' or qual ilike '%get_tenant_id%' or qual ilike '%has_permission%';`
2. Determinar quais roles realmente usam essas policies em produção (o tráfego real é
   `service_role`, que bypassa RLS; `anon` não tem grants; `authenticated` tem grants mas
   nenhuma policy própria — verificar se as policies `{public}` foram feitas para ele).
3. Decisão segura provável: revogar EXECUTE apenas de `anon` e `authenticated` SE nenhuma
   policy `{public}` precisar delas para um caminho vivo — senão, mover as funções para
   fora do schema exposto (`public`) ou aceitar o WARN documentando o porquê AQUI.
4. No mesmo passe: confirmar se as 5 tabelas com RLS ligada e zero policies
   (`legacy_docs`, `node_latency_daily`, `outbox`, `role_permissions`,
   `schema_migrations`) são acessadas só via `service_role` (grep no código por cada
   tabela) — se sim, deny-all é intencional: registrar aqui e encerrar o INFO do advisor.
5. Toda mudança de DDL via migration nova em `packages/db/src/migrations/` (numeração
   sequencial — próxima livre após a 112) aplicada com `npm run db:migrate` ou MCP
   `apply_migration`, nunca SQL solto sem registro.
**DoD:** decisão documentada aqui (mesmo que seja "manter e aceitar o WARN"), migration
aplicada se houver revoke, advisors re-rodados via MCP confirmando, commit + push.

## [x] S3 — Helper único getTenantId() + regra de lint
**Modelo:** DeepSeek V4 Pro no OpenCode (2026-08-25, executado pelo Lucas)
**Resumo:** Criado `apps/api/src/lib/jwt-claims.ts` com `getTenantId(user)`/`getUserId(user)`
(fallback camelCase→snake_case + `uid`/`sub`, 13 testes unitários). Migradas TODAS as
leituras diretas de claims do JWT — ~200 sites em ~90 arquivos de rota (incluindo
destructuring `const { tenantId } = request.user as {...}`, padrões `(req as any).user?.tenantId`,
`user.userId`, `payload.sub` do portal de assinante, websockets e os 3 plugins/serviços não-rota
que liam `user?.tenantId`: sentry plugin, http-cache e rate-limit). Regra ESLint
`no-restricted-syntax` (error) em `apps/api/eslint.config.mjs` proibindo `user.tenantId` /
`*.user.tenant_id` — **decisão do Lucas (2026-08-25, via pergunta): escopo restrito ao objeto
user**, porque a regra literal da spec ("proibir `\.tenantId`/`\.tenant_id` fora de
jwt-claims.ts") colidiria com ~440 usos legítimos de domínio (`this.tenantId`, `opts.tenantId`,
linhas do banco `invoice.tenant_id`) em ~150 arquivos — o bug que a S3 mata é a leitura DO
objeto user. Exceções na config: `jwt-claims.ts` (o helper) e `login.route.ts` (lá `user` é
linha do banco `users`, não claim). 26 testes que codificavam o comportamento antigo (JWT só
com `tenant_id` → 401/vazio) atualizados para a semântica nova (fallback resolve o tenant).
**Verificação:** backend 2719 passed/0 failed/7 skipped (336+2 arquivos); `npm run lint` 0
errors; `npm run typecheck` limpo; grep de leituras diretas de claims nas rotas retorna 0.
Commit local, SEM push (aguarda AUD-G). **Nota de execução:** o working tree sofreu reverts
externos repetidos durante a sessão (outra atividade no repo); tudo reaplicado e verificado no
estado final commitado.
**Modelo (original):** DeepSeek V4 Pro *(mecânico e bem delimitado — ou Sonnet 5)*
**Contexto:** em 2026-08-24, 11 rotas do `apps/api` liam `user.tenant_id` (snake_case)
mas o JWT usa `tenantId` (camelCase) — rejeitavam todo usuário real. O padrão corrigido
foi `user?.tenantId ?? user?.tenant_id`, espalhado na mão por ~28 rotas. Enquanto cada
rota fizer isso manualmente, o bug volta.
**Passos:**
1. Criar `apps/api/src/lib/jwt-claims.ts` exportando
   `getTenantId(user): string | null` e `getUserId(user): string | null` implementando o
   fallback camelCase→snake_case uma única vez, com testes unitários (JWT camelCase,
   snake_case, ambos, nenhum).
2. Substituir TODAS as leituras diretas de `tenantId`/`tenant_id`/`sub`/`userId` vindas
   do JWT nas rotas pelo helper: mapear com
   `grep -rn "tenantId ?? \|tenant_id\b" --include="*.routes.ts" apps/api/src` e migrar
   arquivo por arquivo (diff mínimo — só a expressão de leitura muda).
3. Adicionar regra ESLint (`no-restricted-syntax`) em `apps/api/.eslintrc`/config
   proibindo `\.tenant_id` e `\.tenantId` fora de `jwt-claims.ts` (mensagem: "use
   getTenantId() de lib/jwt-claims"). Rodar `cd apps/api && npm run lint` limpo.
4. Suite backend completa verde.
**DoD:** helper testado, zero leituras diretas restantes (grep prova), lint ativo,
commit local SEM push (aguarda AUD-G).

---

# FASE 5 — Faxina de código morto (~15–20k linhas)

## [x] L1 — Deletar código morto verificado
**Modelo:** DeepSeek V4 Pro (2026-08-25, via OpenCode — executado pelo Lucas)
**Resumo:** Alvos 1, 2, 4 e 5 deletados após re-verificação com grep de cada nome:
`src/lib/gemini.server.ts` (4.033 linhas) + `toolRegistry.ts` + `tenantGuard.ts`;
`src/workers/` inteiro (9 workers; a C1 já tinha removido o cobraiWorker);
`Supabase_Assinaturas/` (7 SQLs soltos); testes órfãos — `tenantGuard.test.ts` + 10 dos
11 testes de `src/__tests__/workers/` (`lockout.test.ts` MANTIDO: testa o
`tenantStatusMiddleware`, código vivo). Total: **6.357 linhas removidas**. Alvo 3
(`src/ai-provider/`) **NÃO deletado**: a re-verificação achou importador vivo
(`embeddingProvider.ts` ← `dbAdmin.ts` ← whatsappSender/erpAdapter) — alvo parado
conforme regra (b), anotado nos achados colaterais. Verificação: `npm run
typecheck:legacy` exit 0 (cobre todo o `src/`); `npm run test:unit` = 3442 passed / 28
failed (2 SignupPage = flakiness documentada, 4/4 verde isolado; 26 = WIP da S3, ver
achados); `cd apps/api && npm test` = 2693 passed / 26 failed (mesmas 26, todos com
título "JWT shape antigo" em arquivos do WIP da S3); `cd apps/api && npm run typecheck`
= 44 erros, todos em arquivos do WIP da S3 — nenhum dos 26 falhas/44 erros referencia
arquivo deletado na L1. Commit local, SEM push (aguarda AUD-G).
**Contexto:** cada item abaixo já foi verificado (2026-08-24) como sem NENHUM importer
vivo. Ainda assim, a spec exige re-verificação antes de cada deleção (o repo anda rápido).
**Alvos e evidência:**
1. `src/lib/gemini.server.ts` (4.375 linhas) + `src/lib/toolRegistry.ts` +
   `src/lib/tenantGuard.ts` — únicos importers eram um do outro.
2. `src/workers/` INTEIRO exceto `cobraiWorker.ts` se a C1 ainda não rodou (se a C1 já
   rodou, a pasta toda): erpSync, fcr, gamification, planSync, report, siteScrape, sla,
   snooze, visionProcessor — todos têm equivalente v2 em `packages/queue/src/workers/`
   (conferido um a um; R5 cumprido).
3. `src/ai-provider/` (6 arquivos) — R3 dizia "portar, não reimplementar"; o porte já
   aconteceu (`model-router.ts` no apps/api tem failover multi-provider + circuit breaker,
   validado em produção 2026-08-23). **Aprovação do Lucas para este item: dada ao aprovar
   este plano.**
4. `Supabase_Assinaturas/` (7 SQLs soltos na raiz, 3 variantes de schema — resto de
   exploração; o schema real vive em `packages/db/src/migrations/`).
5. Testes órfãos dos itens acima (`src/__tests__/...` correspondentes).
**NÃO deletar:** `src/lib/wizard.ts`/`onboarding/wizard.ts` (decisão do Lucas 2026-08-23:
fica); `apps/frontend/` (UI de billing VIVA, usada pelo SettingsPage); `src/repositories/`
e `src/middleware/` (podem ter uso vivo — fora do escopo desta tarefa).
**Passos por alvo:** (a) re-verificar zero importers:
`grep -rln "<nome-base-do-arquivo>" --include="*.ts" --include="*.tsx" src apps packages scripts | grep -v test | grep -v "<o próprio>"`;
(b) hit inesperado → PARAR aquele alvo, anotar em Achados colaterais, seguir para o
próximo; (c) zero hits → deletar arquivo(s) + testes órfãos.
**Verificação:** `npm run typecheck:legacy` + `npm run test:unit` + `cd apps/api && npm test && npm run typecheck` — tudo verde.
**DoD:** alvos deletados (com contagem de linhas removidas no relatório), suites verdes,
commit local SEM push (aguarda AUD-G).

## [x] L2 — Atualizar CLAUDE.md para o estado real
**Modelo:** Claude Sonnet 5 (2026-08-25)
**Resumo:** R1 atualizada (apps/web já deletado, sem menção futura à S78). R6/tabela de flags já
estava correta (C1 já tinha atualizado no próprio commit). R3: registrada como **cumprida**
(fallback portado a `model-router.ts`) mas com nota honesta de divergência — `src/ai-provider/`
**não** foi deletado na L1 (achou importador vivo `embeddingProvider.ts` ← `dbAdmin.ts`), então
não escrevi "deletado" como a spec original pedia (regra global 2). Seção "Estado das frentes"
reescrita com data 2026-08-25 e resultado real das Fases 1–5, incluindo pendências (F1-D2,
F1-AUD, S3, push da L1/AUD-G). **Commit local (`ab0345f`), SEM push:** avisei o Lucas que
o push levaria junto o commit local da L1 (`4589ad9`), cuja própria spec pede "SEM push
(aguarda AUD-G)" — ele escolheu esperar a AUD-G empurrar as duas juntas, em vez de furar a
fila só porque a L2 tem push autorizado por padrão.
**Pré-requisito:** C1 e L1 concluídas (para documentar o estado final, não o intermediário).
**Correções mínimas:**
1. R1: `apps/web` JÁ FOI deletado (a S78 aconteceu de facto) — remover a menção futura.
2. R6 + tabela de flags: refletir a decisão da C1 (flag `COBRAI_ENGINE` removida, engine
   única v2, freio de emergência = emergency-stop). Modelo de texto: o parágrafo existente
   sobre `ATENDIMENTO_ENGINE`.
3. R3: registrar como CUMPRIDA (fallback portado ao `model-router.ts`; `src/ai-provider/`
   deletado na L1).
4. Seção "Estado das frentes": atualizar com data nova e o resultado das Fases 1–5.
5. Nada além disso — não reescrever o arquivo inteiro.
**DoD:** CLAUDE.md fiel à realidade, commit + push (tarefa Claude).

---

# FASE 6 — Banco: performance

## [x] B1 — [MCP] Índices em FKs quentes + limpeza de índices
**Modelo:** Claude Opus 5 no Claude Code, 2026-08-25 *(DDL em produção)*
**Resumo:** migration `114_b1_fk_indexes_e_limpeza.sql` criada e aplicada via MCP.
10 índices de FK nas tabelas quentes (invoices.plan_id; conversations.customer_id/
assigned_to; tickets.customer_id/assigned_to; customers.cto_id; service_orders.cto_id/
premise_id; outbox.tenant_id; cobrai_jobs.rule_id) + drop dos 3 índices duplicados
(`idx_audit_tenant`, `idx_docs_status`, `tenant_meta_pages_tenant` — pares byte-a-byte
idênticos, não-únicos, sem constraint por trás; mantido o nome mais descritivo).
Advisors: `unindexed_foreign_keys` 59 → 49 (zero nas tabelas quentes), `duplicate_index`
3 → 0. `unused_index` foi de 134 → 141 (os 10 novos nascem "sem uso" −3 dropados) e
**não foi tocado** — decisão do passo 4, revisão pós-VPS. `messages`, `audit_log` e
`dead_letter_queue` já não tinham FK sem índice. **Puladas (49, tabelas frias):**
ai_guardrail_blocks, ai_ragas_scores(2), atendimento_emergency_stops(2), automations,
billing_plans, churn_scores, cobrai_rules, cobranca_emergency_stops(2), connector_drafts,
customer_premises, field_photo_diagnoses, fine_tune_runs, hsm_send_logs, incidents,
kb_drafts(3), knowledge_articles, knowledge_documents, legacy_ticket_conversation_map,
notifications, playbooks, route_plans, route_stops(2), service_order_checklist_items,
service_order_events, service_order_materials, service_order_media(2),
subscriber_simulations, team_members, technician_locations, technician_shifts,
technicians(3), tenant_evolution_instances, threat_signals, trust_unlocks, variant_sends,
voice_biometry_consents, voice_calls, voice_prints, voice_scorecards, voice_transcripts.
**Contexto:** advisors de performance (2026-08-24): 57 FKs sem índice, 3 índices
duplicados, 133 índices nunca usados. FKs sem índice penalizam joins e deletes em cascata
independente de RLS.
**Passos:**
1. Via MCP, re-rodar `get_advisors` (performance) e extrair a lista atual de
   `unindexed_foreign_keys` e `duplicate_index`.
2. Priorizar tabelas quentes do produto: `invoices`, `messages`/`conversations`,
   `tickets`, `customers`, `service_orders`, `audit_log`, filas/outbox. Criar índice para
   cada FK dessas tabelas; ignorar tabelas frias por ora (anotar as puladas).
3. Dropar os 3 índices duplicados (manter o de nome mais descritivo).
4. **NÃO** dropar os 133 "unused" agora — sem tráfego real o dado de uso não é confiável;
   registrar como revisão futura pós-VPS.
5. Tudo via migration nova em `packages/db/src/migrations/` (com `IF NOT EXISTS` /
   `CONCURRENTLY` não é necessário — volume atual é baixo), aplicada via `npm run db:migrate`
   ou MCP; advisors re-rodados ao final para confirmar a redução.
**DoD:** migration aplicada, advisors re-verificados, commit + push.

## [ ] B2 — Consolidar policies permissivas múltiplas (BAIXA prioridade — não executar agora)
230 avisos de `multiple_permissive_policies`. Custo real hoje ≈ zero (tráfego usa
`service_role`, que bypassa RLS). Reavaliar depois da VPS e do primeiro tenant real.
Fica registrado para não se perder.

---

# FASE 7 — Infraestrutura (gargalo nº 1)

## [x] I1 — Plano de migração para VPS
**Modelo:** Claude Sonnet 5, 2026-08-25
**Contexto:** produção inteira (Fastify + Redis em Docker Desktop/WSL2 + Cloudflare
Tunnel + runner de deploy) roda numa única máquina Windows 10 local. Healthcheck de 5min
mitiga processo morto; não mitiga energia/rede/Windows Update. Redis `ETIMEDOUT` no boot
é sintoma do cold-start do Docker Desktop (ver memória `astrum-redis-etimedout-boot`).
**Entregável:** documento `.astrum-progress/PLANO_MIGRACAO_VPS.md` com: requisitos
(Node, Redis, tunnel/DNS `api.astrumlabs.online`, envs necessárias SEM valores), escolha
de provedor com preço (2–3 opções BR/latência), passo a passo de cutover com rollback
(DNS de volta pro tunnel local), checklist de smoke-test pós-cutover (login, /trial,
health, worker de fila processando), e adaptação do healthcheck monitor atual para a VPS.
**Não executa a migração** — só o plano; a execução é do Lucas + Claude em sessão dedicada.

**Resumo do que foi feito:** documento criado cobrindo os 5 pontos pedidos. Achado chave:
`api.astrumlabs.online` já é uma rota de Cloudflare Tunnel (não A record fixo), então o
cutover não precisa esperar propagação de DNS — é só decidir qual máquina roda o
`cloudflared` conectado ao tunnel ID existente, o que torna o rollback quase instantâneo.
`docker-compose.yml` de produção já existe no repo e pronto pra VPS (só faltava o plano em
volta dele). Recomendação de provedor: Vultr São Paulo (preço previsível, região BR).

## [ ] I2 — Separar workers da API (pós-VPS — não executar agora)
Hoje `apps/api/src/server.ts` (861 linhas) sobe a API + 20+ workers no mesmo processo
Node — um worker vazando memória derruba a API. Depois da VPS: processo dedicado
(`workers.ts` bootando os `createXWorker()` de `packages/queue`, API sem workers), 2
processos no process manager. Registrado para não se perder; spec detalhada será escrita
quando a I1 concluir.

---

# ORDEM DE EXECUÇÃO RECOMENDADA

```
F1-INV → F1-A → F1-B → F1-C → F1-D → F1-D2   (F1-AUD após cada lote ou no fim)
C1 (Claude Sonnet)                    (independente — pode rodar em paralelo à Fase 1)
D1 → D2 → S3 → L1                     (DeepSeek, em série — AUD-G no fim)
S1 → S2 → B1                          (Claude com MCP — após reset dos créditos)
L2                                    (Claude Sonnet — só após C1 e L1)
I1                                    (Claude + Lucas — quando quiser atacar a VPS)
```

Dependências duras: F1-A/B/C/D/D2 ← F1-INV · L2 ← C1+L1 · I2 ← I1.
Tudo o mais é independente entre si.

---

# ACHADOS COLATERAIS (executores anotam aqui, NÃO consertam)

- **[B1, 2026-08-25]** `npm run db:migrate:dry` lista **10 migrations como pendentes**
  (097_departments, 097_svix_message_id, 105, 106, 107, 108, 109, 110, 113, 114) que na
  verdade já estão aplicadas no banco — foram aplicadas via MCP/SQL Editor, que grava em
  `supabase_migrations.schema_migrations`, não na tabela `schema_migrations` do runner do
  repo. Rodar `npm run db:migrate` hoje re-executaria as 10 (nem todas idempotentes — ex.:
  `097_departments_table.sql`). Por isso a 114 foi aplicada via MCP. Precisa de um
  `db:baseline` (ou equivalente) para ressincronizar o tracking — não feito aqui (escopo).
  **✅ RESOLVIDO (2026-08-26).** Verificado via MCP (`information_schema`/`pg_proc`) um por
  um — sem usar `--baseline` cego, que marcaria tudo pendente como aplicado sem checar:
  `097_departments_table`, `105_appsec02_storage_private_bucket`,
  `106_super_admin_requires_aal2`, `107_apps_api_mfa`, `108_atendimento_emergency_stop`,
  `109_tenants_integration_keys_enabled_modules`, `110_cobranca_emergency_stop`,
  `113_s2_secdef_rpc_surface_e_denyall`, `114_b1_fk_indexes_e_limpeza`,
  `115_tickets_snooze_columns`, `116_tickets_conversation_id` — todas confirmadas já
  aplicadas de verdade (colunas/tabelas/funções existem), tracking sincronizado
  (`INSERT INTO schema_migrations`) sem reexecutar SQL nenhum. `097_svix_message_id.sql`
  **continua genuinamente pendente** — o próprio arquivo diz "NÃO APLICADA AINDA... aplicar
  quando o dono aprovar"; confirmado via MCP que a coluna `svix_message_id` não existe.
  Fica para o Lucas decidir se aprova. Achado extra: a linha antiga
  `105_whatsapp_health_snapshots.sql` no tracking não corresponde a nenhum arquivo em disco
  hoje (renomeado/substituído em algum momento por colisão de numeração) — linha órfã
  inofensiva, não removida (não atrapalha o runner).
- **[F1-INV, 2026-08-24]** Fora do escopo do grep pedido (`src/pages`+`src/components`+
  `src/hooks`), existem mais ~85 ocorrências de `supabase.from(`/`supabase.rpc(` em
  `src/lib/db.ts` (~35), `src/lib/supabaseDb.ts` (~18), `src/App.tsx` (~15),
  `src/lib/seedAstrum.ts` (2), `src/test-supabase.ts` (1) — mesmo bug de RLS, não
  inventariado linha a linha nesta tarefa.
- **[F1-INV, 2026-08-24]** `apps/api/src/domain/campo/field-ops.routes.ts` tem várias
  rotas registradas com barra invertida em vez de `/` no path (ex.: linha 216
  `fastify.post('\api\v2\field\os:id/transition', ...)`, e mais nas linhas 485, 594, 615,
  692, 744, 817, 851, 871, 892) — parece bug de find/replace no Windows; provavelmente
  quebra essas rotas em runtime. Impacto real não investigado.
  **✅ RESOLVIDO — confirmado no código atual (2026-08-26): todas as 21 rotas do arquivo
  usam `/api/v2/field/...` com barra normal. Não achei o commit exato do fix (não estava
  descrito em nenhuma mensagem), mas o bug não existe mais.**
- **[F1-INV, 2026-08-24]** `SettingsPage.tsx` linhas 1040–1726: 10 integrações (MK-Auth,
  RD Station, Pipedrive, HubSpot, RadiusNet, Asaas, Gerencianet, Qdrant, Instagram,
  Facebook) ainda gravam em `tenants.integrations` (coluna plaintext antiga) via client
  anônimo, enquanto a rota já migrada (`PUT /api/v2/settings/integration-keys`) grava em
  `tenants.integration_keys` (cifrada). Migrar essas 10 exige decidir se vão pro schema
  cifrado novo e migrar dados já salvos na coluna antiga — não é só trocar a chamada.
- **[F1-INV, 2026-08-24]** `MonitoringPage.tsx:33` (lista da DLQ) não filtra por
  `tenant_id` na query direta — vaza jobs de outros tenants na tela hoje (a rota
  `GET /api/v2/dlq` já existente corrige isso ao migrar).
- **[F1-INV, 2026-08-24]** `OnboardingWizardPage.tsx` (step Report) usa
  `supabase.auth.getSession()` — uma trilha de autenticação Supabase Auth separada do JWT
  próprio do `apps/api`, logada em `src/App.tsx:1936` via `supabase.auth.signInWithPassword`.
  Vale investigar se é intencional ou resquício de uma migração incompleta.
- **[F1-B, 2026-08-25 — schema real ≠ o que o código assume, verificado via MCP
  `execute_sql` contra `information_schema.columns`]** Sete ocorrências de
  `ChatPage.tsx`/`WhatsAppPage.tsx` gravam ou leem colunas que **não existem** nas
  tabelas reais — bug pré-existente, não é RLS (a query já falhava com "column does not
  exist" antes da migration 092). Não migradas nesta tarefa (decisão do Lucas: só migrar
  o seguro agora). Ficam para uma tarefa futura de decisão de schema/produto:
  - `ChatPage.tsx:217` — `tenants.closing_reasons`/`tenants.forms` não existem (só
    `settings`/`integration_keys`/`cobrai_*` são JSONB reais em `tenants`). Cai sempre no
    fallback hardcoded de 4 motivos; `tenantForms` sempre `[]`.
  - `ChatPage.tsx:368` — insert em `messages` com `ticket_id, body, sender_type, agent_id,
    agent_name, attachment, is_internal`: NENHUMA dessas colunas existe. A tabela real é
    `id, tenant_id, conversation_id (NOT NULL), role, content, from_ai, tokens_used,
    created_at, extra, created_by, legacy_id` — schema orientado a `conversation_id`, não
    a `ticket_id`. **Consequência real: quando o operador manda mensagem pelo inbox, ela
    nunca é salva no Postgres** (só sai de fato pelo WhatsApp via Evolution API; o insert
    falha e o código não checa `error`).
  - `ChatPage.tsx:420` — update de `evo_msg_ids` em `messages`: coluna não existe.
  - `ChatPage.tsx:452` — update de `tickets.snoozed_until/snooze_reason/snoozed_by` +
    `status='snoozed'`: nenhuma coluna existe E `'snoozed'` nem é valor aceito pelo CHECK
    constraint de `tickets.status` (só `open/in_progress/resolved/closed`).
  - `ChatPage.tsx:472` — update de `tickets.closing_reason`: coluna não existe.
    **✅ RESOLVIDO (2026-08-27, migration 118).** Coluna criada; `confirmClosing` trocado
    pra uma única chamada `apiPatch('/api/v2/tickets/:id', { status: 'resolved',
    closingReason })` (schema `updateTicketSchema` + mapeamento camelCase→snake_case no
    handler, mesmo padrão de `assignedTo`). Substituiu as 2 chamadas antigas (uma delas
    era o `updateTicketStatus` de `src/lib/db.ts`/`supabaseDb.ts`, que continua com o
    mesmo bug de client anônimo pros OUTROS ~15 callers espalhados pelo app — não
    corrigido aqui, é o achado maior "~85 ocorrências em src/lib" já registrado acima,
    fora de escopo desta tarefa pontual).
  - `ChatPage.tsx:513` — update de `customers` com `document`/`plan`/`tenantId`: colunas
    reais são `cpf`/`plan_id`/`tenant_id` (nomes diferentes, não é só RLS).
  - `WhatsAppPage.tsx:97` — `tenants.evolution_instances` (plural, array): a coluna real é
    `evolution_instance` (singular, texto único — não suporta múltiplas instâncias).
  - `WhatsAppPage.tsx:99` — upsert em `tenant_evolution_instances` com `label,
    phone_number, ai_enabled`: a tabela real só tem `id, tenant_id, instance_name, status,
    created_at` — essas 3 colunas não existem.
    **Decisão do Lucas (2026-08-27): multi-instância por tenant É roadmap real**
    (departamentos com números diferentes) — não é caso de simplificar a UI pra 1:1.
    Exige desenho de schema de verdade (tabela `tenant_evolution_instances` ganhar
    `label`/`phone_number`/`ai_enabled` + o worker/webhook do Evolution API saber rotear
    por instância, não só por tenant) — escopo grande, vira tarefa própria, não iniciada
    nesta sessão.
  Antes de migrar essas 7, alguém (produto + engenharia) precisa decidir, por caso: criar
  migration com a coluna/tabela que falta, ou tratar como feature morta e remover da UI.
  Não é uma tarefa "portar query pra rota" — é desenho de schema.
  **✅ `ChatPage.tsx:368` (insert de mensagem) e `:420` (`evo_msg_ids`) RESOLVIDOS
  (commit `85a5850`, migration 116 `tickets.conversation_id`) — ver achado novo #1 na
  F1-EXTRA abaixo.** `:452` (`snoozed_until/snooze_reason/snoozed_by`) também **RESOLVIDO**
  (migration 115, commit `f5fe51f` — achado novo #2 na F1-EXTRA). `:513` (`document/plan`
  em `customers`) também **RESOLVIDO** — `PUT /api/v2/customers/:id`, ver "✅ Corrigido"
  na F1-EXTRA acima. `:472` (`tickets.closing_reason`) também **RESOLVIDO** (migration 118,
  ver detalhe na F1-B acima). `ChatPage.tsx:217` (`tenants.closing_reasons/forms`):
  **decisão do Lucas (2026-08-27) — motivos fixos bastam**, não fica customizável por
  tenant; a leitura de `tenants.closing_reasons`/`forms` (sempre cai no fallback de 4
  motivos hoje) fica como está, não migrada — não vale abrir rota pra algo que não vai
  ser usado. `WhatsAppPage.tsx` (`:97`, `:99`) seguem pendentes — ver decisão de
  multi-instância acima.
- **[F1-C, 2026-08-25 — schema real ≠ o que o código assume, verificado via MCP
  `execute_sql` contra `information_schema.columns` ANTES de escrever qualquer rota]**
  26 das 31 ocorrências de `SettingsPage.tsx` (+ 1 fora do grep, ver linha 148 abaixo)
  gravam/leem colunas ou tabelas que **não existem** — bug pré-existente, não é RLS. Não
  migradas nesta tarefa (decisão do Lucas: só migrar o seguro agora, mesmo protocolo da
  F1-B). Agrupadas por causa raiz:
  - **`tenants.sso_config`** (linhas 375, 402, 409, 460) — coluna não existe. SSO/domínio
    customizado fica sem persistência real.
    **✅ RESOLVIDO (2026-08-27, migration 122).** Coluna criada; `saveSsoConfig`/load
    migrados pra `GET/PUT /api/v2/settings/sso`.
  - **`tenants.theme`** (linhas 402, 409) — coluna não existe. Branding (cores/logo/fonte)
    nunca é salvo de fato.
    **✅ RESOLVIDO (2026-08-27, migration 122).** Coluna criada; `saveThemeConfig`/load
    migrados pra `GET/PUT /api/v2/settings/theme`.
  - **`tenants.vector_store_config`** (linhas 460, 488) — coluna não existe. Config do
    banco vetorial (Qdrant/provider/url/apiKey) não persiste.
    **✅ RESOLVIDO (2026-08-27, migration 122).** Coluna criada; rota `GET/PUT
    /api/v2/settings/vector-store` **compartilhada** entre `SettingsPage.tsx`,
    `AIConfigPage.tsx` e `KnowledgeBasePage.tsx` (as 3 telas gravavam o mesmo campo com
    lógica duplicada — agora 1 fonte de verdade só).
  - **`knowledge_articles.vector_indexed`** (linha 463) — coluna não existe na tabela real
    (`id, tenant_id, document_id, title, content, category, tags, ingest_status,
    legacy_id, extra, created_at, updated_at`); contagem de artigos indexados sempre falha.
    **✅ RESOLVIDO (2026-08-27, migration 122).** Coluna criada (`boolean default false`);
    contagem devolvida junto no `GET /api/v2/settings/vector-store` (`indexedCount`).
  - **`tenants.monthly_token_limit` / `worker_concurrency` / 7 campos `backup_*`**
    (linhas 511, 531, 784) — nenhuma dessas 9 colunas existe. Limites de IA e config de
    backup (bucket/projeto GCP/hora/retenção/status) não persistem.
    **✅ RESOLVIDO, mas não como migração de schema (decisão do Lucas, 2026-08-27):**
    backup removido da UI já em sessão anterior (nunca teve backend, Supabase já faz
    backup automático). `monthly_token_limit`/`worker_concurrency` **removidos da UI**
    (SettingsPage.tsx e AIConfigPage.tsx, duplicavam `plan-limits.service.ts` — que já
    tem `maxMessagesPerMonth` por plano funcionando de verdade — e `worker_concurrency`
    é global por tipo de worker no BullMQ, não por tenant; não fazia sentido dar a cada
    ISP um botão de auto-aprovar mais gasto de IA na conta compartilhada da Astrum).
  - **`tenants.holidays`** (linhas 545, 559, 576, 588) — coluna não existe. Lista de
    feriados (nacional + manual) nunca é salva; `holidays.routes.ts` já reconhecia isso
    num comentário próprio (citado na F1-INV), agora confirmado que a causa não é só RLS —
    a coluna nunca existiu.
    **✅ RESOLVIDO (2026-08-27, migration 122).** Coluna criada; add/remove/leitura
    migrados pra `GET/PUT /api/v2/settings/holidays` (rota nova em `holidays.routes.ts`,
    ao lado do `fetch-national` que já existia).
  - **`role_permissions`** (linha 303) — schema real é `(id, role, resource, action)`
    (RBAC global estático, tabela deny-all mencionada na S2 do plano), não
    `(tenant_id, role_name, permissions jsonb)` como o código assume. O upsert falharia
    mesmo com grants de `anon` restaurados — é tabela errada pro conceito, não coluna
    faltando. Matriz de permissões por role/tenant não tem onde ser persistida hoje.
    **✅ RESOLVIDO — decisão do Lucas (2026-08-27): RBAC fixo, não por tenant.** A tela
    "Matriz de Permissões" (`savePermissions`/`togglePermission`/aba "Permissões")
    removida por inteiro — os 4 papéis fixos já são o que `rbac.middleware.ts` de fato
    aplica hoje (hardcoded, não lê banco); a tela nunca esteve conectada a isso.
  - **`tenants.integrations`** (linhas 1040, 1217, 1242, 1267, 1345, 1368, 1400, 1680,
    1703, 1726 — os 10 provedores não portados pra `integration-keys` cifrada) — coluna
    não existe (só `integration_keys`, a nova/cifrada, existe). Já era achado colateral da
    F1-INV como "grava em coluna plaintext antiga"; agora confirmado que nem a coluna
    antiga existe mais — o `update` falha por completo, não é um problema de cifra/schema
    novo vs. antigo, é ausência total de destino.
    **✅ RESOLVIDO — já estava migrado quando revisitei em 2026-08-27** (não achei o
    commit exato; aconteceu em alguma sessão entre 25/08 e 26/08 não documentada aqui).
    Confirmado por grep: zero `supabase.from('tenants')` restantes em `SettingsPage.tsx`;
    os 17 provedores (os 7 originais + os 10 desta lista) usam
    `apiPut('/api/v2/settings/integration-keys', { keys })`.
  - **`saveCompanySettings`** (linha 858) — `supabase.from('tenants').update(cleanSettings)`
    espalha as chaves de `companySettings` (`name, logoUrl, supportEmail, supportPhone,
    workingHours, timezone` — default em `useAppStore.ts:227`) como nomes de coluna
    direto. Só `name` existe na tabela real; as outras 5 fariam o update inteiro falhar
    (Postgres rejeita update com coluna inexistente). Padrão perigoso à parte do bug de
    schema: se algum dia a coluna existir, esse handler aceita gravar QUALQUER chave que
    estiver no estado do Zustand sem allowlist — vale revisitar quando for desenhado.
    **✅ RESOLVIDO (2026-08-27, migration 119 + commit local).** Colunas `logo_url`,
    `support_email`, `support_phone`, `working_hours`, `timezone` criadas em `tenants`.
    `saveCompanySettings` reescrito com allowlist explícita (6 campos, nada mais) via
    `PUT /api/v2/settings/company` (nova rota em `settings-page.routes.ts`); adicionado
    também `GET /api/v2/settings/company` + load-on-mount — antes disso a tela nunca
    recarregava o que foi salvo (Zustand sem persist, sempre voltava pro mock hardcoded
    no reload). Testes novos cobrindo allowlist (campos desconhecidos são ignorados) e
    tenant-scoping.
  - **`seedTicketsAndLogs`** (linha 153, mais a ocorrência em 148 não capturada pelo grep
    de uma linha só — `await supabase\n  .from('tickets')...`, mesmo padrão de quebra de
    linha já avisado na correção pós-F1-A) — ferramenta de dev/seed atrás de
    `role==='admin'`. `tickets.insert` usa `subject` (coluna real é `title`) e
    `messages.insert` usa `ticket_id, sender_type, body` (nenhuma existe; schema real é
    `conversation_id, role, content`). Ambos os inserts sempre falham silenciosamente
    (erro não checado). Não é prioridade — é ferramenta de dev, mas ilustra o mesmo padrão.
  Antes de migrar qualquer uma dessas, produto + engenharia precisam decidir caso a caso:
  criar a coluna/tabela que falta (migration), redirecionar pro JSONB `tenants.settings`/
  `tenants.extra` (existem e estão livres — nenhuma rota os usa hoje), ou tratar como
  feature morta e remover da UI. Recomendação de quem executou a F1-C: SSO/theme/vector
  store/token-limits/backup/holidays são candidatos naturais a virar sub-chaves de
  `tenants.settings` (JSONB) numa migration só, em vez de 9+ colunas novas — mas é decisão
  de produto, não foi aplicada aqui.
- **[F1-D, 2026-08-25 — bugs de produção em rotas já commitadas na F1-A (não pushadas),
  achados ao verificar schema real via MCP ANTES de escrever rotas novas]** Detalhe completo
  na seção da F1-D acima ("Achado crítico — bugs de produção"). Resumo: `cobrai-page.routes.ts`
  (3 de 4 rotas quebradas — `financial_status`, `stage/template_name/error_message/sent_at`,
  `cobrai_paused_customers`, nenhuma dessas colunas existe) e `dashboard.routes.ts`
  (`csat-ratings` lê `tickets.csat_score`, também inexistente). Todos os testes Vitest dessas
  rotas passam porque mockam o Supabase — nunca bateram no schema real. **F1-AUD precisa
  decidir**: corrigir antes do push (mapear pra colunas reais ou pra fonte alternativa) ou
  documentar como known-issue e abrir tarefa separada — mas não pode pushar sem uma decisão
  explícita, porque hoje essas 4 rotas retornam 500 pra qualquer chamada real.
  **✅ RESOLVIDO (commit `ec10b97`, "fix(cobranca+dashboard): corrige 4 rotas com colunas
  inexistentes") — confirmado no código atual (2026-08-26): as 4 rotas mapeiam pras colunas
  reais, comentário `AUD-G (2026-08-25)` documenta a correção inline.**
- **[F1-D, 2026-08-25 — schema real ≠ o que o código assume, verificado via MCP]** Mesma
  família de gap já documentada na F1-C, encontrada de novo em mais 2 páginas:
  - `AIConfigPage.tsx` (linha 301→321 pré-migração, agora só o residual em `loadConfig`) —
    `tenants.vector_store_config`/`monthly_token_limit`/`worker_concurrency` não existem
    (idêntico ao achado da F1-C em SettingsPage). `knowledge_articles.vector_indexed`
    também não existe (idêntico ao achado da F1-C).
    **✅ RESOLVIDO (2026-08-27)** — ver detalhe na entrada da F1-C acima (mesma migration
    122 + rota compartilhada `/api/v2/settings/vector-store`; token limit/concurrency
    removidos da UI).
  - `KnowledgeBasePage.tsx` (linhas 166, 175) — `tenants.embedding_config`/
    `vector_store_config` não existem.
    **✅ RESOLVIDO (2026-08-27, migration 122)** — `embedding_config` incluída na mesma
    migration por ser o par load/save de `vector_store_config` nesta tela; ambas via
    `GET/PUT /api/v2/settings/embedding-config` + `/vector-store`. De brinde: o guard
    `currentTenant?.id` no `loadConfigs` antigo (bug pré-existente — `currentTenant` é
    string, `.id` sempre `undefined`, mesmo padrão já achado e comentado no próprio
    arquivo pro `fetchKBArticles`) foi removido junto, já que o tenant agora resolve
    server-side via JWT.
  - **Novo, não visto na F1-B/C:** `AIObservabilityPage.tsx` (linha 148, fora do grep de uma
    linha só) e `AIConfigPage.tsx` (linha 430, idem) leem `ai_performance_logs` esperando
    colunas `escalated`, `agent`, `active_flow`, `step`, `tool_called`, `input_summary`,
    `provider`, `tokens_used` — **nenhuma existe**. O schema real da tabela (verificado via
    MCP) é orientado a custo/qualidade por ticket:
    `ticket_id, category, sentiment, response_time_ms, sla_compliant, is_critical,
    tokens_in, tokens_out, model, cost_usd, context_tokens_saved, customer_id,
    conversation_id, use_case`. Não é rename — é outro modelo de dados (sessão/fluxo/agente
    de IA vs. custo/qualidade por ticket). Toda a seção "Métricas Operacionais" de
    `AIObservabilityPage.tsx` (taxa de escalação, quedas de funil, erros de ferramenta, log
    bruto) depende desses campos inexistentes. Mesmo gap provavelmente se repete em
    `AICostsPage.tsx` (2 ocorrências de `ai_performance_logs`, ver F1-D2) e
    `SentimentMetricsCard.tsx` — não confirmado ainda, mas mesma tabela.
    **Decisão do Lucas (2026-08-27): vale instrumentar isso de verdade** (não ocultar a
    seção) — mas é telemetria nova no LangGraph + tabela nova, escopo grande demais pra
    entrar junto com os itens aditivos desta sessão. Vira tarefa própria (não iniciada).
    **✅ RESOLVIDO (2026-08-28, migration 126, commit `a72b41b`).** Schema novo em
    `ai_performance_logs` (`escalated`/`agent`/`active_flow`/`step`/`tool_called`/`result`/
    `input_summary`/`provider`) mapeado 1:1 do `finalState` que o `langGraphService`
    (`domain/agent/langgraph.service.ts`) já calculava por mensagem mas nunca gravava —
    inclusive o caminho de erro fatal, que antes não gravava telemetria nenhuma. Rota nova
    `GET /api/v2/ia/observability-logs` (tenant-scoped) substitui a leitura direta via
    client anônimo. `AIObservabilityPage.tsx` migrada; a agregação de custo mensal
    (gráfico 30d, breakdown por provider, limite via `tenants.ai_budget_usd_monthly` real
    em vez do heurístico `50 * qtd`) também corrigida — filtrava por um campo `.month` que
    nunca existiu nos dados reais e sempre renderizava zero. Tabela cross-tenant do
    super-admin fica vazia (precisa de rota própria, fora do escopo). Suítes verdes
    (backend 3613/3621 isolado — 8 falhas são o padrão de timeout sob carga total já
    documentado: SignupPage/owasp-audit/langgraph, não-relacionadas).
  - `KanbanBoard.tsx` (linha 63) — `tickets.pipeline_stage` não existe; o board de vendas
    (Kanban) nunca persistiu o card na coluna certa, mesmo antes da migration 092.
    **✅ RESOLVIDO (2026-08-27, migration 121).** Decisão do Lucas: estágios próprios (não
    derivar de `tickets.status`) — o componente já tinha 4 colunas fixas de vendas
    (lead/qualificado/proposta/fechado) sem equivalência nenhuma com o ciclo de vida de
    suporte. Coluna com `CHECK` restringindo aos 4 valores; `KanbanBoard.tsx` migrado de
    `supabase.from('tickets').update` direto (anon, bloqueado) pra
    `PATCH /api/v2/tickets/:id` (schema `updateTicketSchema.pipelineStage` novo).
  - `CustomerDetailSheet.tsx` (linha 141) — tabela `reflections` (notas por cliente) não
    existe; só `ai_reflections` existe (diário do Cérebro Noturno, schema/conceito
    diferente: `reflection_date, metrics, hypotheses, actions`, sem `title/body/entity_id`).
    **✅ RESOLVIDO (2026-08-27, migration 120).** Decisão do Lucas: tabela nova
    (`customer_notes`), não reaproveitar `ai_reflections`. Rotas `GET/POST
    /api/v2/customers/:id/notes`; UI ganhou um formulário real de criar nota na aba
    Timeline (antes só existia o slot de exibição, nunca teve como criar uma).
- **[F1-D, 2026-08-25 — inventário F1-INV incompleto]** Ver seção "Achado crítico — o
  inventário F1-INV está incompleto" na F1-D acima. 18 ocorrências reais em 12 arquivos
  (`AICostsPage.tsx`, `WebhooksPage.tsx`, `SyntheticPage.tsx`, `EscalationRulesBuilder.tsx`,
  `ERPIntegrationsPage.tsx`, `SecurityPage.tsx`, `OperatorMobilePage.tsx`, `TopHeader.tsx`,
  `SentimentMetricsCard.tsx`, `IntelligenceHubPage.tsx`, `NetworkTwinPage.tsx`,
  `SandboxPage.tsx`) não apareceram no inventário original por causa do grep de uma linha só.
  Ficam para a F1-D2 (task nova criada acima).
- **[S1, 2026-08-25]** No início desta sessão, a árvore de trabalho já tinha um lote grande
  de arquivos modificados/não commitados sem relação com a S1 — padrão bate com a C1 (Fase
  2, rollback do CobrAI): `apps/api/src/domain/cobranca/cobrai-dispatch.routes.ts`,
  `cobrai-dispatch.service.ts`, `cobrai-page.routes.ts`+teste,
  `apps/api/src/infrastructure/config/engine-flags.ts`+teste,
  `packages/queue/src/workers/cobrai.worker.ts`, deleção de `src/workers/cobraiWorker.ts`
  (+ teste) e mudança em `src/__tests__/workers/lockout.test.ts`, uma migration nova não
  commitada (`packages/db/src/migrations/110_cobranca_emergency_stop.sql`), e também
  `apps/api/src/domain/provedor/dashboard.routes.ts`+teste,
  `apps/api/src/domain/rede/graph.routes.ts`+teste,
  `apps/api/src/domain/conhecimento/knowledge-reindex.routes.ts`+teste e `server.ts`. Esse
  lote está **incompleto**: `cobrai-dispatch.service.test.ts` falha 3 testes (mismatch de
  shape em `buildCobraiEnqueue`, engines legacy/v2) rodando a suite completa do backend.
  Não mexi em nenhum desses arquivos (fora do escopo da S1) nem os incluí no commit da S1.
  Quem retomar a C1 (ou o que quer que seja esse lote) precisa terminar/corrigir antes de
  rodar a suite completa de novo — hoje ela sempre vai reportar 3 falhas por causa disso,
  não por regressão da S1.
- **[D1, 2026-08-25 — execução em paralelo com C1/S1 na mesma árvore de trabalho]** A D1
  rodou enquanto agentes Claude executavam C1 e S1 na MESMA pasta (arquivos de cobrança
  aparecendo/desaparecendo do `git status` durante a sessão; commits 434fd65 e 9106370
  feitos no meio do trabalho). O executor da D1 manteve escopo estrito (só
  `package.json`+`package-lock.json` no commit) e esperou a suíte deles terminar antes de
  rodar `npm install`. **Consequência na verificação da D1:** a suíte backend completa tem
  1 suíte falhando — `apps/api/src/infrastructure/ai/batch.service.test.ts` com
  `ReferenceError: Cannot access 'supabaseFrom' before initialization` — bug de hoisting do
  `vi.mock` INTRODUZIDO PELO COMMIT DA S1 (434fd65; `const supabaseFrom` no top-level do
  teste é usada dentro da factory do `vi.mock`, que é hoisted). Confirmado por: run
  isolado do arquivo falha igual; `git diff be7d470..HEAD` mostra o vi.mock vindo da S1;
  o erro é em tempo de import do próprio teste, sem relação com versões de dependência
  (o diff da D1 não toca source). **Fica para a S1/AUD-G corrigir** (mover o
  `vi.fn` pra dentro da factory ou usar `vi.hoisted`). Resto verde: backend 2700
  passed/7 skipped, frontend 3483 passed/7 skipped.
- **[D1, 2026-08-25 — bug npm 11.8.0 com overrides em pins exatos + lockfile]** O `npm
  audit fix` (npm 11.8.0) re-resolveu as deps do `@getzep/zep-js` e **desaplicou** o
  override global existente (`form-data ^4.0.4`): o lockfile do HEAD tinha form-data
  deduplicado em 4.0.5 (override aplicado, aresta "invalid" cosmética no `npm ls`), e o
  audit fix criou entradas aninhadas `node_modules/@getzep/zep-js/node_modules/{form-data@
  4.0.0, qs@6.11.2}` vulneráveis. O override ANINHADO novo (`"@getzep/zep-js": {
  "form-data": "^4.0.6", "qs": "^6.15.2" }`) funciona em install limpo (testado em dir
  temporário: aplica 4.0.6/6.15.3), mas o npm 11 NÃO re-resolve entradas aninhadas já
  presentes no lockfile (nem com `npm install`, nem com `npm update <pkg>`). Solução
  aplicada: deletar as 3 entradas aninhadas obsoletas do lockfile + as pastas
  correspondentes e rodar `npm install` — o override passou a aplicar (form-data 4.0.6,
  qs 6.15.3 deduplicados). **AUD-G:** conferir com `npm ci` em pasta limpa que o lockfile
  permanece coerente com npm 11 e que as entradas aninhadas vulneráveis não voltam.
- **[D1, 2026-08-25 — react-router-dom 6→7 pulado (regra 3)]** O fix dos 2 moderates
  restantes (`react-router`/`react-router-dom`, GHSA-wrjc-x8rr-h8h6 +
  GHSA-337j-9hxr-rhxg) exige `react-router-dom@7.18.2` — major 6→7 com breaking no
  frontend legado inteiro (todas as rotas usam API v6). Fora do escopo de D1; exige tarefa
  de migração dedicada. `npm audit --omit=dev` final: **2 moderate, 0 high, 0 critical**.
- **[S2, 2026-08-25 — ⚠️ P0 achado ao auditar a tabela `outbox`: o Outbox Pattern inteiro
  está morto em produção]** `apps/api/src/infrastructure/queue/outbox.service.ts` importa
  `import supabase from '../database/supabase.client'` — o **default export** desse módulo é
  `supabaseClient`, o client **ANÔNIMO** (linhas 8/9/47 do `supabase.client.ts`:
  `export const supabase = supabaseClient` e `export default supabaseClient`; o admin é o
  named export `supabaseAdmin`). Como `anon` tem zero grants desde a 092, TODO
  `outboxService.publish()` falha (o insert loga erro, então é QUEBRADO_COM_ERRO_VISIVEL, não
  silencioso) e `processPending()` sempre lê lista vazia → o worker `outbox-poller`
  (`packages/queue/src/workers/outbox.worker.ts`, bootado em `server.ts:710`) roda em vazio.
  Consequência: eventos que dependem do outbox (ex.: `document.uploaded` em
  `domain/ia/documents.routes.ts`) nunca chegam ao BullMQ por esse caminho. **Este arquivo
  NÃO estava na lista dos 5 da S1** porque o grep daquela tarefa procurou o import nomeado
  (`{ supabase }`) e este usa import default — vale reauditar o `apps/api` com
  `grep -rn "from '.*supabase.client'" apps/api/src | grep -v supabaseAdmin` antes de dar a
  frente de client anônimo por encerrada. Não corrigido aqui (regra global 1 — escopo da S2 é
  RLS/grants, e a correção é troca de client + checagem de `error`, escopo da S1).
  **✅ RESOLVIDO (commit `2880100`, 2026-08-26):** `outbox.service.ts` incluído no lote de
  45 arquivos migrados de client anônimo pra `supabaseAdmin` — confirmado no código atual
  (`import { supabaseAdmin as supabase } from '../database/supabase.client'`). Ver
  `astrum-anon-client-fix` na memória.
- **[S2, 2026-08-25 — grants TRUNCATE/TRIGGER/REFERENCES para `authenticated` são
  sistêmicos]** Confirmação e generalização do achado colateral da C1: o `ALTER DEFAULT
  PRIVILEGES` do projeto dá a `authenticated` também `TRUNCATE`, `TRIGGER` e `REFERENCES`
  além de SELECT/INSERT/UPDATE/DELETE — em praticamente todas as tabelas, não só nas duas de
  emergency-stop. **RLS não cobre TRUNCATE** (não é row-scoped), então a RLS por tenant não
  protege contra um `TRUNCATE` vindo de um contexto `authenticated`. A S2 fechou isso apenas
  nas 5 tabelas deny-all (onde `authenticated` não precisa de grant nenhum). Nas demais o
  grant DML é **necessário** (o caminho MT-02c `withTenantRLS` roda como `authenticated`), mas
  `TRUNCATE`/`TRIGGER`/`REFERENCES` não são usados por nada — cabe uma tarefa dedicada de
  `REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated`
  + ajuste do `ALTER DEFAULT PRIVILEGES` para não reintroduzir em tabela nova. Mitigador atual
  (não é solução): `authenticated` é NOLOGIN — só se chega nele via PostgREST (que não expõe
  TRUNCATE) ou via `SET ROLE` numa conexão de servidor confiável.
  **✅ RESOLVIDO (migration 117, aplicada via MCP + registrada em schema_migrations,
  2026-08-26).** `REVOKE TRUNCATE, TRIGGER, REFERENCES` de `anon`+`authenticated` em todas
  as tabelas do `public` (confirmado via `information_schema.role_table_grants`: 113→0
  tabelas com essas 3 permissões para `authenticated`; `anon` já estava em 0). SELECT/
  INSERT/UPDATE/DELETE mantidos intactos — `get_advisors` rodado depois não mostrou nenhum
  WARN novo. `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` ajustado (migrations futuras
  rodando como `postgres`, o caminho normal do projeto, não reintroduzem as 3 permissões).
  **Gap que ficou:** `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` deu "permission
  denied to change default privileges" mesmo pra `postgres` — só o próprio `supabase_admin`
  pode alterar os próprios defaults. Tabela nova criada por `supabase_admin` (fora do fluxo
  normal de migration deste projeto) ainda nasceria com as 3 permissões — documentado no
  cabeçalho da migration 117.
- **[S2, 2026-08-25 — `node_latency_daily` não tem dimensão de tenant]** A tabela é
  `(node, day, p50, p95, count)` — sem `tenant_id` — e `GET /api/v2/ia/latency/report`
  (`apps/api/src/domain/ia/latency.routes.ts`) a serve a qualquer usuário autenticado, sem
  filtro possível. Ou seja: qualquer tenant vê a latência agregada global dos nós do grafo de
  IA. Não é PII e o dado é de infraestrutura, mas é observabilidade cross-tenant por desenho —
  decidir se a rota vira super_admin-only ou se a tabela ganha `tenant_id`. Fora do escopo da S2.
  **✅ RESOLVIDO (2026-08-26):** decisão tomada pela opção mais simples e sem custo de
  schema — rota restrita a `super_admin` (`requirePermission('reports', 'admin')`, mesmo
  padrão já usado em `dlq.routes.ts` pra dado de infraestrutura). Confirmado por grep que
  nenhum frontend consome essa rota hoje (endpoint ainda sem consumidor), então não há
  fluxo de tenant legítimo pra quebrar. Teste novo `latency.routes.test.ts` (2/2 verde).
- **[S2, 2026-08-25 — WARN de Auth fora do escopo]** O advisor de segurança tem 1 WARN não
  relacionado às funções: `auth_leaked_password_protection` (checagem de senha vazada contra o
  HaveIBeenPwned desligada). É um toggle do painel Supabase (Auth → Password), não DDL — não dá
  pra resolver por migration. Ligar leva ~1 min e vale, ainda mais com o `/trial` aberto ao
  público.
- **[D2, 2026-08-25 — grep prescrito na spec não cobre dependência hoisted consumida só pelo
  `apps/api`]** O passo 1 da D2 pedia grep restrito a
  `src scripts vite.config.ts vite.preview.config.mts`. Nesse monorepo (npm workspaces, um
  `node_modules` só), uma dependência declarada apenas no `package.json` da raiz pode ser
  importada de verdade pelo `apps/api/src` sem nunca aparecer no `apps/api/package.json` —
  achei 9 casos assim (`@ai-sdk/openai`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`,
  `@fastify/etag`, `@sentry/profiling-node`, `duckdb-async`, `langsmith`, `pino-pretty`,
  `wrangler`). A regra "Proibido: remover dep citada em `apps/api/package.json`" não cobre esse
  caso porque a dependência não está citada lá — só é importada de lá. Segui o grep literal
  primeiro, mas ampliei pro repo inteiro antes de decidir o que remover (ver nota de escopo na
  seção da D2 acima). **Vale generalizar essa checagem** (grep contra `apps/api/src` também, não
  só `apps/api/package.json`) em qualquer tarefa futura que mexer em `package.json` da raiz —
  o mesmo padrão provavelmente existe ao contrário (dep declarada só no `apps/api/package.json`
  mas nunca usada nem lá, se algum dia alguém rodar depcheck lá dentro).
- **[L1, 2026-08-25 — alvo 3 (`src/ai-provider/`) parado por importador vivo]** A
  re-verificação da L1 achou `src/lib/embeddingProvider.ts:2` importando
  `../ai-provider/ai-provider.setup` — import real de código vivo, não comentário. Cadeia:
  `src/lib/whatsappSender.ts` e `src/lib/integrations/erpAdapter.ts` importam
  `src/lib/dbAdmin.ts`, que importa `embeddingProvider.ts`, que importa o ai-provider na
  inicialização do módulo (`createProviderFromEnv()`). A verificação de 2026-08-24 que
  classificou o item como sem importadores não pegou essa cadeia. Regra (b) da spec seguida:
  alvo parado, sem deleção; os testes `src/__tests__/ai-provider/*` também ficaram. Para
  deletar o ai-provider no futuro, decidir antes o destino de `embeddingProvider.ts`/
  `dbAdmin.ts` (ex.: migrar o embed para o provider do `apps/api` ou manter o ai-provider).
- **[L1, 2026-08-25 — verificação rodou com WIP não commitado da S3 na árvore]** As suites
  não fecharam verdes por trabalho em andamento de OUTRA tarefa na mesma pasta (S3,
  getTenantId — `apps/api/src/lib/jwt-claims.ts` untracked + ~90 rotas modificadas):
  26 testes de `*.routes.test.ts` com título "JWT shape antigo (tenant_id)" falham porque as
  rotas do WIP agora aceitam snake_case via `getTenantId()` e os testes (não tocados pelo WIP
  ainda) esperam 401; `cd apps/api && npm run typecheck` acusa 44 erros TS2345 também em
  arquivos do WIP (tipagem `JwtUserLike` do `jwt-claims.ts`). Evidência de que NÃO é a L1:
  `git diff` das rotas mostra só mudanças de `getTenantId`; nenhuma das falhas/erros
  referencia os arquivos deletados na L1; `npm run typecheck:legacy` (cobre `src/`) sai com
  exit 0. A S3 precisa terminar (incluindo atualizar esses 26 testes) para as suites voltarem
  ao verde — AUD-G deve considerar isso ao auditar a L1.
- **[L1, 2026-08-25 — doc órfã não tocada (escopo)]** `src/lib/MIGRATION_GUIDE.md` descreve
  o motor legado (`gemini.server.ts`, `ai-provider.service.ts`) agora deletado. É
  documentação, não código — fora do escopo da L1; a L2 (ou uma tarefa de docs) pode decidir
  se o guia é atualizado ou removido.
