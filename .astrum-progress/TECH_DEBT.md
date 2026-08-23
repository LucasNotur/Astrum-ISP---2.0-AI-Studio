# ASTRUM — TECNOLOGIAS PENDENTES DE ATIVAÇÃO TOTAL (TECH DEBT)
> Documento para rastrear ferramentas e tecnologias que foram implementadas na base de código, mas ainda não estão 100% operacionais ou ativas no fluxo principal (devido à transição do Strangler Fig Pattern ou integrações futuras).

## 1. TurboRepo (Monorepo)
**Status Atual:** ✅ Ativação total concluída (2026-08-23)
**Data de Registro:** 2026-05-31

### ✅ Conclusão (2026-08-23):
`packages/ai`, `packages/db` e `packages/queue` ganharam `package.json` + `tsconfig.json`
próprios (mesmo padrão de `packages/shared`). `turbo run typecheck`, `turbo run test` e
`turbo run dev` validados de ponta a ponta pelos 5 workspaces (`@astrum/ai`, `@astrum/api`,
`@astrum/db`, `@astrum/queue`, `@astrum/shared`):
- **typecheck:** 5/5 verdes (precisou `declaration: false` nos 3 pacotes novos — o
  `tsconfig.base.json` compartilhado liga `declaration: true`, e isso força o TS a
  computar tipos exportáveis de `.d.ts` mesmo sob `--noEmit`, quebrando em imports
  cross-package tipo `ai`/`vercel-ai.service.ts`; `packages/queue` também precisou incluir
  `apps/api/src/types/fastify.d.ts` no `include` porque `drift.worker.ts` importa
  `drift.routes.ts`, que usa o decorator `authenticate` do Fastify sem a ambient
  augmentation visível fora do programa TS do `apps/api`).
- **test:** achado e corrigido um bug real no `vitest.config.ts` raiz — `root` não era
  fixado, então `vitest run` disparado de dentro de um subpacote (via turbo) usava `cwd`
  como root e os globs `include` (relativos ao repo) nunca batiam com nada
  ("no test files found", exit 1) — quebrava silenciosamente `turbo run test` pra
  qualquer pacote, incluindo `apps/api`, que já tinha suíte própria. Corrigido com
  `root: __dirname` + script de cada pacote escopado por filtro posicional
  (`vitest run packages/db --passWithNoTests` etc.) pra não rodar a suíte inteira 5x.
  Resultado: `packages/db`/`ai` sem testes ainda (passam vazio), `queue` 19 arquivos/82
  testes verdes, `api` 303 arquivos/2515 testes verdes.
- **dev:** `turbo run dev` sobe `apps/api` (único pacote com script `dev` real) via
  `tsx watch src/server.ts` sem erro.

O que ficou aberto (não bloqueia nada, só não foi feito nesta passada): decidir se vale
trocar `"dev"` da raiz de `"npm --prefix apps/api run dev"` pra `"turbo run dev"` de vez
(item 5 abaixo, mantido) e criar `package.json` pra `packages/ai`/`db` quando esses
pacotes ganharem testes de verdade (hoje passam vazios via `--passWithNoTests`).

### O que aconteceu (histórico original, 2026-05-31):
Durante o **Sprint 0 / Dia 2**, a estrutura do monorepo (TurboRepo) foi criada (`turbo.json`, atualização do `package.json` raiz para workspaces). Os scripts `dev`, `build` e `test` de chamadas do `turbo` também foram configurados.
No entanto, o frontend e o servidor pararam de carregar, pois as pastas `apps/api` e `apps/web` ainda não contêm seus próprios arquivos `package.json` definindo como eles devem rodar.
Como contorno rápido para garantir o carregamento do frontend (já que estamos no meio de uma transição gradual Strangler Fig), os comandos originais do Vite/Express foram mantidos no `package.json` da raiz sob as chaves `dev` e `build`, enquanto os comandos do turbo foram jogados para `dev:turbo` e `build:turbo`.

### ✅ Atualização (2026-08-23) — conferido direto no repo, parcialmente resolvido:
- `apps/api` **já tem** `package.json` próprio (com seus próprios `scripts`/`dependencies`) — feito.
- `apps/web` **não existe mais** (deletado no S78, Fase 3 do `PLANO_MIGRACAO_EXPRESS_FASTIFY.md`) — item obsoleto, não precisa mais ser feito.
- `"dev"` na raiz não é mais `"tsx server.ts"` (esse arquivo nem existe mais — `server.ts` raiz foi apagado na Fase 4, 2026-08-17/18). Hoje é `"npm --prefix apps/api run dev"` — funciona, mas ainda não é `"turbo run dev"` como o item 4 original pedia (esse continua em `dev:turbo`, separado).
- `packages/*` **ainda não** têm `package.json` próprio, **exceto** `packages/shared` — `packages/ai`, `packages/db` e `packages/queue` continuam dependendo do `package.json` da raiz (import relativo, não workspace de verdade).

### O que falta para a ativação total (atualizado):
1. ~~Criar `package.json` em `apps/api`~~ — feito.
2. ~~Criar `package.json` em `apps/web`~~ — N/A, `apps/web` foi deletado.
3. ~~Criar `package.json` próprio em `packages/ai`, `packages/db`, `packages/queue`~~ — feito
   2026-08-23 (ver "Conclusão" acima).
4. ~~Validar se `turbo run dev` sobe tudo certo~~ — feito 2026-08-23, `turbo run dev` sobe
   `apps/api` sem erro (único pacote com script `dev` real).
5. Decidir se vale trocar `"dev"` da raiz de `"npm --prefix apps/api run dev"` pra `"turbo run dev"` de vez (hoje os dois convivem, `dev` e `dev:turbo` fazem coisas diferentes) — ou se o `--prefix` atual já é bom o suficiente pro fluxo de trabalho real. **Único item ainda aberto**, é decisão de preferência de workflow, não bug.

### Como verificar (atualizado):
✅ Concluído 2026-08-23 — `packages/ai`, `packages/db` e `packages/queue` têm `package.json`
próprio e `turbo run typecheck`/`turbo run test`/`turbo run dev` sobem certo pelos 5
workspaces. Só falta a decisão de preferência do item 5.
