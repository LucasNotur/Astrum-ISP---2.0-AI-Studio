# CLAUDE.md — Regras de trabalho na Astrum

> Este arquivo é lido pela IA (Claude Code) no início do trabalho. As regras abaixo
> são decisões do dono do produto (Lucas) e **têm precedência sobre qualquer inferência**.
> A execução das sessões segue `.astrum-progress/PLANO_MESTRE_V2.md` (protocolo §0 obrigatório).

## Regras invioláveis (R1–R6)

- **R1 — Frontend:** o frontend oficial é o **legado** (`src/pages/*`, 22 páginas, Vite na raiz).
  **NUNCA migrar telas para `apps/web`.** `apps/web` será canibalizado (hooks bons) e deletado na S78.
  Mudanças no frontend legado são permitidas apenas em: camada de dados (repositories), auth,
  hooks de rede e correção de bug. Páginas **novas** (ex.: dashboard de saúde) são permitidas.

- **R2 — Dados:** Supabase é o único banco de destino. Redis para cache/filas. Firestore só
  existe até o cutover (S82) — **proibido criar coleção/campo novo no Firestore**.

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
- DoD completo em `.astrum-progress/PLANO_MESTRE_V2.md` §0.4.

## Flags de transição (env)

| Env | Valores | Default | Efeito |
|---|---|---|---|
| `COBRAI_ENGINE` | `legacy` \| `v2` | `legacy` | Qual worker de cobrança sobe (R6) |
| `ATENDIMENTO_ENGINE` | `legacy` \| `v2` | `legacy` | Qual fluxo de atendimento envia respostas (cutover S74) |

Rollback de cutover = trocar a env de volta. Nenhuma das duas engines de um domínio sobe junto com a outra.

## Estado das frentes de backend (2026-07-01)

- `/src` + `server.ts` raiz (Express + Firestore) — **em produção hoje**.
- `apps/api` (Fastify + Supabase) — fundação nova, alta qualidade, ainda sem tráfego real.
- `apps/backend` — **removido** na S68 (órfão; preservado em `graveyard/billing-enterprise`).
- `apps/frontend` — billing/subscriptions **em uso** por `src/pages/SettingsPage.tsx` (UI viva, mantido).

Fontes da verdade: `docs/LEGACY_RETIREMENT_PLAN.md`, `docs/DB_MIGRATION_GAP_REPORT.md`, `.astrum-progress/PLANO_MESTRE_V2.md`.
