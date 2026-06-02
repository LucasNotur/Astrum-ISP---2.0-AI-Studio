# ASTRUM — TECNOLOGIAS PENDENTES DE ATIVAÇÃO TOTAL (TECH DEBT)
> Documento para rastrear ferramentas e tecnologias que foram implementadas na base de código, mas ainda não estão 100% operacionais ou ativas no fluxo principal (devido à transição do Strangler Fig Pattern ou integrações futuras).

## 1. TurboRepo (Monorepo)
**Status Atual:** ⚠️ Parcialmente Ativo
**Data de Registro:** 2026-05-31

### O que aconteceu:
Durante o **Sprint 0 / Dia 2**, a estrutura do monorepo (TurboRepo) foi criada (`turbo.json`, atualização do `package.json` raiz para workspaces). Os scripts `dev`, `build` e `test` de chamadas do `turbo` também foram configurados.
No entanto, o frontend e o servidor pararam de carregar, pois as pastas `apps/api` e `apps/web` ainda não contêm seus próprios arquivos `package.json` definindo como eles devem rodar.
Como contorno rápido para garantir o carregamento do frontend (já que estamos no meio de uma transição gradual Strangler Fig), os comandos originais do Vite/Express foram mantidos no `package.json` da raiz sob as chaves `dev` e `build`, enquanto os comandos do turbo foram jogados para `dev:turbo` e `build:turbo`.

### O que falta para a ativação total:
1. Criar `package.json` separados dentro de `apps/api`, `apps/web` e os pacotes em `packages/*`.
2. Mover as dependências e roteamentos das aplicações antigas da raiz para dentro de `apps/web` e `apps/api`.
3. Validar se `turbo run dev` sobe todos os pacotes adequadamente pelas suas próprias portas/scripts.
4. Remover do `package.json` da raiz o `dev: "tsx server.ts"` e alterar de volta para `"dev": "turbo run dev"`.

### Como verificar (No futuro):
Caso você precise verificar as pendências, olhe para este arquivo. 
Se `apps/api` e `apps/web` possuírem seus packages e o `package.json` raiz estiver com os scripts `"dev": "turbo run dev"`, essa pendência de tecnologia turborepo estará **concluída**.
