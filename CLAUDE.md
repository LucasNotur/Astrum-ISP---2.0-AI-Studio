# CLAUDE.md — Regras de trabalho na Astrum

> Este arquivo é lido pela IA (Claude Code) no início do trabalho. As regras abaixo
> são decisões do dono do produto (Lucas) e **têm precedência sobre qualquer inferência**.
> Pendências reais e atuais: `.astrum-progress/CHECKLIST_PENDENCIAS_EXTERNAS.md` (mantido
> atualizado). `.astrum-progress/PLANO_MESTRE_V2__EM_ANDAMENTO.md` documenta o plano
> original (S68–S98, protocolo §0) mas está **desatualizado nas fases iniciais** — foi
> escrito assumindo Firestore vivo até a S82; o Firestore foi removido por completo já em
> 2026-07-03, e o Express foi aposentado em 2026-08-17/18, ambos por planos separados fora
> dessa numeração. Ver aviso no topo daquele arquivo antes de tratá-lo como fonte da verdade.

## Regras invioláveis (R1–R6)

- **R1 — Frontend:** o frontend oficial é o **legado** (`src/pages/*`, 22 páginas, Vite na raiz).
  `apps/web` já foi deletado (S78 concluída de fato — hooks bons canibalizados antes da remoção).
  **NUNCA recriar telas lá.** Mudanças no frontend legado são permitidas apenas em: camada de
  dados (repositories), auth, hooks de rede e correção de bug. Páginas **novas** (ex.: dashboard
  de saúde) são permitidas.

- **R2 — Dados:** Supabase é o **ÚNICO** banco. Redis para cache/filas. O Firestore foi
  **REMOVIDO totalmente do código** em 2026-07-03 (Plano FIRESTORE-ZERO —
  `.astrum-progress/PLANO_FIRESTORE_ZERO__CONCLUIDO.md`). O backend legado acessa o Supabase pela
  camada de compatibilidade `src/lib/db-compat/` (via seam `src/lib/firebaseAdmin.ts`,
  que mantém o nome histórico mas é 100% Supabase). **Proibido reintroduzir firebase/firebase-admin.**

- **R3 — LLMs:** GPT-4o-mini para conversação, GPT-4o para orquestração/raciocínio. O fallback
  multi-provider foi **portado** para `apps/api/src/infrastructure/ai/providers/model-router.ts`
  (failover multi-provider + circuit breaker, validado em produção 2026-08-23) — **regra
  cumprida**. O `src/ai-provider/` legado (adapters openai/anthropic/gemini) ainda não foi
  deletado: a L1 (2026-08-25) achou um importador vivo na re-verificação
  (`embeddingProvider.ts` ← `dbAdmin.ts` ← whatsappSender/erpAdapter) e parou a deleção daquele
  alvo por segurança — resolver essa cadeia de import fica para uma tarefa futura de faxina.

- **R4 — Backend:** toda lógica nova vai em `apps/api` (Fastify/DDD). **Proibido criar feature nova
  em `/src`** (backend legado) — lá só se corrige bug crítico de produção.

- **R5 — Portar, não apagar:** código legado só é deletado quando o comportamento equivalente
  estiver no `apps/api`, testado, **e** recebendo o tráfego de produção.

- **R6 — Uma régua de cobrança:** engine única, **v2** (`packages/queue/src/workers/cobrai.worker.ts`),
  sem env de escolha — `COBRAI_ENGINE` foi removida em 2026-08-25 (Option A, ver abaixo). Freio de
  emergência = `POST /api/v2/cobranca/emergency-stop` (kill switch real, não env).

## Padrão de qualidade (obrigatório)

- **Todo código novo de produção tem teste Vitest** cobrindo o comportamento (não só "compila").
- Rodar `npx vitest run <arquivos>` antes de fechar a sessão.
- DoD completo em `.astrum-progress/PLANO_MESTRE_V2__EM_ANDAMENTO.md` §0.4.

## Flags de transição (env)

Nenhuma engine flag de cobrança/atendimento ativa hoje — ambas foram removidas (ver os dois
parágrafos abaixo). `engine-flags.ts` só resta com `isMultiAgentEnabled()` (`MULTI_AGENT_ENABLED`, IA-10).

`COBRAI_ENGINE` foi **removida do código em 2026-08-25** (C1 — Option A, repetindo a decisão
do atendimento): o worker legado (`src/workers/cobraiWorker.ts`) só era bootado pelo Express,
apagado por completo na Fase 4 (2026-08-17/18) — setar a env pra `legacy` não revertia mais
nada, só impedia o worker v2 de subir e nada subia no lugar (desligava a cobrança inteira sem
ninguém perceber). `getCobraiEngine()`/`isCobraiEngineActive()`/`shouldBootWorker()`
(`engine-flags.ts`) foram deletados; `cobrai.worker.ts` agora só processa e envia (R5 — sem
"legado" de verdade pra reverter). **Para parar a cobrança CobrAI de enviar mensagem de
verdade em produção** (incidente real, não teste), use o freio de emergência de verdade:
`POST /api/v2/cobranca/emergency-stop` (super_admin) — para o ENVIO via WhatsApp, mas o resto
do processamento (lockout de tenant inadimplente, invoice.paid, reactivate, notify_human)
continua rodando. Ver migration `110_cobranca_emergency_stop.sql`.

`ATENDIMENTO_ENGINE` foi **removida do código em 2026-08-23** (Option A da decisão sobre
o rollback quebrado — ver abaixo): a Fase 4 já tinha apagado o webhook/worker Express por
completo (2026-08-17/18), então não sobrava uma segunda engine real para a env escolher —
só um modo-sombra que fingia ser rollback. `getAtendimentoEngine()`/`decideSend()`
(`engine-flags.ts`, `shadow-mode.ts`) e o campo `isShadow` no job de mensagem foram
deletados; `message.worker.ts` agora só processa e envia (R5 — sem "legado" de verdade pra
reverter). **Para parar o atendimento IA de responder de verdade em produção** (incidente
real, não teste), use o freio de emergência de verdade: `POST
/api/v2/atendimento/emergency-stop` ou o painel `/atendimento-emergencia` (super_admin) —
ver `astrum-rollback-atendimento-quebrado` na memória do Claude Code.

## Estado das frentes de backend (2026-08-25)

- `apps/api` (Fastify + Supabase) — **é o único backend em produção**, desde a Fase 4 do
  Plano Migração Express→Fastify (2026-08-17/18). Recebe 100% do tráfego real: login,
  atendimento IA, cobrança, dashboards, tudo.
- `/src` + `server.ts` raiz (Express) — **removido por completo** na mesma Fase 4
  (`server.ts` e `src/routes/*` apagados; não existe mais nenhum Express rodando).
  `src/workers/messageWorker.ts` (worker legado de atendimento, órfão desde a Fase 4)
  também foi removido em 2026-08-23.
- `apps/backend` — removido na S68 (órfão; preservado em `graveyard/billing-enterprise`).
- `apps/frontend` — billing/subscriptions **em uso** por `src/pages/SettingsPage.tsx` (UI viva, mantido).

**Resultado do PLANO_ACAO_100_OPERACIONAL (Fases 1–5, `.astrum-progress/PLANO_ACAO_100_OPERACIONAL.md`):**
- **Fase 1** (frontend legado parando de consultar Supabase direto com o client anônimo,
  depois que a `092_p0_rls_hardening.sql` revogou os grants do `anon`): a maior parte das
  páginas migradas para rotas novas em `apps/api` (Dashboard, CobrAI, Billing, Team, Settings,
  Monitoring, SuperAdmin, AIObservability, Onboarding, Inventory, Tickets, NetworkGraph/Twin,
  KnowledgeBase, Sidebar/SuperAdminRoute, Customers). Ficaram pendentes: 12 páginas que o
  inventário original não pegou (grep multi-linha, F1-D2) e a auditoria formal antes do push
  (F1-AUD) — os commits já estão em produção porque foram ao main "de carona" em pushes de
  tarefas seguintes, não por um push formal auditado.
- **Fase 2** (C1): cobrança tem engine única v2, sem flag de escolha; freio de emergência real
  em `POST /api/v2/cobranca/emergency-stop`. Concluída e em produção.
- **Fase 3** (D1/D2): zero vulnerabilidades critical/high (`npm audit`); 13 dependências mortas
  do Express legado removidas da raiz. Concluída e em produção.
- **Fase 4** (S1/S2): client Supabase anônimo trocado por `supabaseAdmin` nos 4 arquivos que
  ainda usavam; RPC de `has_permission` revogada + deny-all real nas 5 tabelas sem policy.
  Pendente: S3 (helper único `getTenantId()` + regra de lint).
- **Fase 5** (L1/L2): ~6.360 linhas de código morto deletadas (`gemini.server.ts`, `src/workers/`
  inteiro, `Supabase_Assinaturas/`) — commit local, ainda aguardando push pela auditoria geral
  (`AUD-G`). `src/ai-provider/` **não** foi deletado (ver R3 acima). Este arquivo (L2) é a
  própria Fase 5.

Fontes da verdade: `.astrum-progress/PLANO_MIGRACAO_EXPRESS_FASTIFY.md` (retirada do
Express), `.astrum-progress/PLANO_FIRESTORE_ZERO__CONCLUIDO.md` (remoção do Firestore),
`.astrum-progress/PLANO_ACAO_100_OPERACIONAL.md` (checklist Fases 1–7, status por tarefa),
`.astrum-progress/CHECKLIST_PENDENCIAS_EXTERNAS.md` (pendências reais — mais confiável
que o `PLANO_MESTRE_V2` pra saber "o que falta", ver aviso no topo daquele arquivo).
