# ASTRUM — TECNOLOGIAS PENDENTES DE ATIVAÇÃO TOTAL (TECH DEBT)
> Documento para rastrear ferramentas e tecnologias que foram implementadas na base de código, mas ainda não estão 100% operacionais ou ativas no fluxo principal (devido à transição do Strangler Fig Pattern ou integrações futuras).

## 1. TurboRepo (Monorepo)
**Status Atual:** ⚠️ Parcialmente Ativo (avançou desde o registro original — ver atualização 2026-08-23 abaixo)
**Data de Registro:** 2026-05-31

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
3. Criar `package.json` próprio em `packages/ai`, `packages/db`, `packages/queue` (mesmo padrão de `packages/shared`).
4. Validar se `turbo run dev` sobe tudo certo pelas próprias portas/scripts (script `dev:turbo` já existe, não testado a fundo).
5. Decidir se vale trocar `"dev"` da raiz de `"npm --prefix apps/api run dev"` pra `"turbo run dev"` de vez (hoje os dois convivem, `dev` e `dev:turbo` fazem coisas diferentes) — ou se o `--prefix` atual já é bom o suficiente pro fluxo de trabalho real.

### Como verificar (atualizado):
Se `packages/ai`, `packages/db` e `packages/queue` tiverem `package.json` próprio e `turbo run dev` subir tudo sozinho pelas portas certas, essa pendência está **concluída**.
