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
  **NUNCA migrar telas para `apps/web`.** `apps/web` será canibalizado (hooks bons) e deletado na S78.
  Mudanças no frontend legado são permitidas apenas em: camada de dados (repositories), auth,
  hooks de rede e correção de bug. Páginas **novas** (ex.: dashboard de saúde) são permitidas.

- **R2 — Dados:** Supabase é o **ÚNICO** banco. Redis para cache/filas. O Firestore foi
  **REMOVIDO totalmente do código** em 2026-07-03 (Plano FIRESTORE-ZERO —
  `.astrum-progress/PLANO_FIRESTORE_ZERO__CONCLUIDO.md`). O backend legado acessa o Supabase pela
  camada de compatibilidade `src/lib/db-compat/` (via seam `src/lib/firebaseAdmin.ts`,
  que mantém o nome histórico mas é 100% Supabase). **Proibido reintroduzir firebase/firebase-admin.**

- **R3 — LLMs:** GPT-4o-mini para conversação, GPT-4o para orquestração/raciocínio. O sistema de
  fallback multi-provider **já existe** em `src/ai-provider/` (adapters openai/anthropic/gemini) e
  deve ser **portado** para o motor novo, nunca reimplementado do zero.

- **R4 — Backend:** toda lógica nova vai em `apps/api` (Fastify/DDD). **Proibido criar feature nova
  em `/src`** (backend legado) — lá só se corrige bug crítico de produção.

- **R5 — Portar, não apagar:** código legado só é deletado quando o comportamento equivalente
  estiver no `apps/api`, testado, **e** recebendo o tráfego de produção.

- **R6 — Uma régua de cobrança:** até a S76, apenas **UMA** engine CobrAI ativa, controlada pela
  env `COBRAI_ENGINE` (`legacy` | `v2`, default `legacy`). Ver `engine-flags.ts`.

## Padrão de qualidade (obrigatório)

- **Todo código novo de produção tem teste Vitest** cobrindo o comportamento (não só "compila").
- Rodar `npx vitest run <arquivos>` antes de fechar a sessão.
- DoD completo em `.astrum-progress/PLANO_MESTRE_V2__EM_ANDAMENTO.md` §0.4.

## Flags de transição (env)

| Env | Valores | Default | Efeito |
|---|---|---|---|
| `COBRAI_ENGINE` | `legacy` \| `v2` | `legacy` | Qual worker de cobrança sobe (R6). Rollback = trocar a env (o worker legado ainda existe e é bootado condicionalmente). |
| `ATENDIMENTO_ENGINE` | `legacy` \| `v2` | `legacy` no código; `v2` em produção desde 2026-08-17 | Liga/desliga o ENVIO real do motor v2 (`shadow-mode.ts`). **NÃO é mais um rollback pro legado** — a Fase 4 apagou o webhook/worker Express por completo (2026-08-17/18) e o código morto foi limpo em 2026-08-23. Setar `legacy` só põe o v2 em modo sombra (processa, não envia) — não restaura nada antigo. |

Nenhuma das duas engines de um domínio sobe junto com a outra. **Para parar o atendimento
IA de responder de verdade em produção** (incidente real, não teste), use o freio de
emergência: `POST /api/v2/atendimento/emergency-stop` ou o painel `/atendimento-emergencia`
(super_admin) — ver `astrum-rollback-atendimento-quebrado` na memória do Claude Code.

## Estado das frentes de backend (2026-08-23)

- `apps/api` (Fastify + Supabase) — **é o único backend em produção**, desde a Fase 4 do
  Plano Migração Express→Fastify (2026-08-17/18). Recebe 100% do tráfego real: login,
  atendimento IA, cobrança, dashboards, tudo.
- `/src` + `server.ts` raiz (Express) — **removido por completo** na mesma Fase 4
  (`server.ts` e `src/routes/*` apagados; não existe mais nenhum Express rodando).
  `src/workers/messageWorker.ts` (worker legado de atendimento, órfão desde a Fase 4)
  também foi removido em 2026-08-23.
- `apps/backend` — removido na S68 (órfão; preservado em `graveyard/billing-enterprise`).
- `apps/frontend` — billing/subscriptions **em uso** por `src/pages/SettingsPage.tsx` (UI viva, mantido).

Fontes da verdade: `.astrum-progress/PLANO_MIGRACAO_EXPRESS_FASTIFY.md` (retirada do
Express), `.astrum-progress/PLANO_FIRESTORE_ZERO__CONCLUIDO.md` (remoção do Firestore),
`.astrum-progress/CHECKLIST_PENDENCIAS_EXTERNAS.md` (pendências reais — mais confiável
que o `PLANO_MESTRE_V2` pra saber "o que falta", ver aviso no topo daquele arquivo).
