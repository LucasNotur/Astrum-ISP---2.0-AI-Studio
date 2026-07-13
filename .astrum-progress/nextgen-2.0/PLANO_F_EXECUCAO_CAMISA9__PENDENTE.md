# PLANO F — EXECUÇÃO "CAMISA 9": o roteiro que um modelo menor (Sonnet) executa sozinho
# Criado em 2026-07-13 por Fable 5. Cada tarefa é ATÔMICA, com arquivos exatos,
# padrão a copiar e critério de "pronto" objetivo. Zero ambiguidade proposital.

> **Como usar (para o executor, seja Sonnet ou humano):**
> 1. Faça as tarefas NA ORDEM. Cada uma tem: arquivos, o que fazer, o padrão a
>    imitar (um arquivo IRMÃO que já existe e funciona) e o teste de pronto.
> 2. NUNCA invente estrutura: copie o irmão indicado e adapte. É assim que o
>    resto do repo foi feito — consistência > criatividade aqui.
> 3. Depois de CADA tarefa: `cd apps/api && npx tsc --noEmit` (0 erros) +
>    `npx vitest run <arquivo de teste novo>` (verde). Só então commit e próxima.
> 4. Regras invioláveis: CLAUDE.md (R1–R6). Toda tabela nova tem RLS + GRANT
>    (ver migration 079 como padrão). Todo serviço novo tem teste Vitest.
> 5. Migrations: número sequencial após a última em `packages/db/src/migrations/`.
>    Aplicar local com `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx tsx packages/db/src/migrate.ts`.

---

## REGRA DE OURO DO EXECUTOR MENOR

Antes de escrever QUALQUER arquivo, abra o "irmão" indicado e copie a ESTRUTURA
(imports, formato de rota, jeito de mockar no teste). O repo é altamente
padronizado — 90% de uma tarefa nova é o mesmo esqueleto de uma que já existe.
Se algo não bate com o irmão, o errado é você, não o irmão.

---

## FASE 1 — LIGAR O QUE JÁ EXISTE (sem código novo de feature)

### F1-01 — Aplicar todas as migrations pendentes em produção
- **Arquivos:** nenhum (operação).
- **Fazer:** rodar `npm run db:migrate` apontando `DATABASE_URL` para o Supabase
  de produção. Conferir com `--dry-run` antes.
- **Pronto quando:** `db:migrate:dry` diz "0 pendentes".

### F1-02 — Rodar o seed demo em staging e conferir as telas
- **Fazer:** `npm run seed:demo` (staging), abrir cada página do painel e ver se
  populou (Customers, BI, Map, ChatPage, CobrAI, Valor Gerado).
- **Pronto quando:** as 6 telas mostram dados do "ISP Demo Astrolândia".

### F1-03 — Ligar signup/upgrade aplicando o tier ao tenant
- **Arquivos:** `src/pages/SignupPage.tsx` (linha ~82, onde cria o trial),
  `src/lib/plans.ts` (já tem `enabledModulesForTier`).
- **Fazer:** ao criar o tenant, gravar `plan='radar_trial'` e
  `enabled_modules = enabledModulesForTier('radar_trial', allKeys)`. No upgrade,
  trocar para `'astrum'` e `enabled_modules = {}`.
- **Irmão:** a lógica de `enabled_modules` já roda em `src/hooks/useEnabledModules.ts`.
- **Pronto quando:** um tenant novo nasce só com os módulos do Radar; ao "assinar",
  todos aparecem. Teste Vitest cobrindo os dois caminhos.

---

## FASE 2 — CÉREBRO NOTURNO EM PRODUÇÃO (E-03..E-05 já codados; falta o cron)

### F2-01 — Worker cron do nightly-brain (03:00)
- **Arquivo novo:** `packages/queue/src/workers/nightly-brain.worker.ts`.
- **Irmão a copiar:** `packages/queue/src/workers/drift.worker.ts` (mesma cara:
  BullMQ repeat, flag de habilitação, chama um service de `apps/api`).
- **Fazer:** worker que, se `NIGHTLY_BRAIN_ENABLED=true`, roda
  `runNightlyReflection` + (se `NIGHTLY_BRAIN_ACT_ENABLED`) `executeSuggestedActions`
  para cada tenant ativo, todo dia 03:00. Registrar no `server.ts` (imitar o
  bloco do `message.worker`, linha ~402).
- **Pronto quando:** teste Vitest do worker (mock do service) verde + tsc 0.

### F2-02 — Card "O que a Astrum pensou esta noite" no dashboard
- **Arquivo:** nova aba/card em `src/pages/intelligence/` (ver ChatPage como
  padrão de fetch). Consome `GET /api/v2/ia/reflections`.
- **Skill obrigatória:** abrir `astrum-design` ANTES (é regra do U2).
- **Pronto quando:** o card lista as reflexões, com selo de severidade colorido.

### F2-03 — Card de autoevolução no Valor Gerado
- **Arquivo:** `src/pages/ValorGeradoPage.tsx` — adicionar bloco que consome
  `GET /api/v2/ia/autoevolucao/report`.
- **Pronto quando:** o `headline` do relatório aparece no topo do Valor Gerado.

---

## FASE 3 — D-04 NOC: FECHAR O LOOP VISUAL

### F3-01 — Tela de incidentes
- **Arquivo novo:** `src/pages/intelligence/IncidentsPage.tsx` + rota.
- **Irmão:** qualquer página de lista+detalhe (usar `PageHeader`/`FilterBar`/
  `DetailSheet` do design system U1).
- **Fazer:** lista de `GET /api/v2/rede/incidents`; botões que chamam
  confirm/communicate/normalize. O botão "comunicar" abre confirmação (é o gate
  humano — imitar o ConfirmDialog do `suspend_signal`).
- **Pronto quando:** dá para levar um incidente de suspeita a normalizada pela UI.

---

## FASE 4 — DIFERENCIAIS POR DADOS (D-02, D-08) — usam o seed demo como combustível

### F4-01 — D-02 Backtesting de régua (motor)
- **Arquivo novo:** `apps/api/src/domain/cobranca/policy-backtest.service.ts`.
- **Irmão:** `apps/api/src/domain/atendimento/replay.service.ts` (mesmo padrão de
  "reexecutar histórico com dry-run" + ports injetáveis).
- **Fazer:** recebe uma política (dias/tom/desconto) + lê faturas históricas do
  tenant (no demo, as 2500 do seed) → projeta recuperação vs política atual.
  SEM promover nada — só devolve o comparativo (honestidade estatística: marcar
  "o passado não reage"). Migration se precisar de tabela de políticas salvas.
- **Pronto quando:** teste Vitest com faturas mockadas mostra delta calculado;
  rodar no tenant demo devolve número plausível.

### F4-02 — D-08 CFO virtual (motor)
- **Arquivo novo:** `apps/api/src/domain/financeiro/cashflow-forecast.service.ts`.
- **Irmão:** `apps/api/src/domain/ml/forecast.ts` (média móvel sazonal já pronta).
- **Fazer:** projeção de caixa 90d combinando faturas previstas + inadimplência
  prevista (churn) + custo por cliente. Cenários otimista/base/pessimista.
- **Pronto quando:** teste verde + rota `GET /api/v2/financeiro/cashflow`.

---

## FASE 5 — CADA D-XX RESTANTE É UMA SESSÃO (pré-condição: RN17)

Para D-01, D-03, D-09, D-10, D-11, D-12, D-13, D-16, D-17, D-18: cada um começa
relendo o galho no `PLANO_A` (§2/§2b), auditando o código real do dia, e SÓ
DEPOIS codando. O executor menor faz UM D-XX por vez, seguindo o irmão indicado
no próprio galho ("Fundação real:"). Nunca dois ao mesmo tempo (RN da consolidação).

---

## APÊNDICE — CHECKLIST QUE O EXECUTOR REPETE EM TODA TAREFA

```
[ ] Li o "irmão" indicado e copiei a estrutura
[ ] Migration (se houver) tem RLS + GRANT (padrão 079) e roda local
[ ] Serviço novo tem teste Vitest cobrindo o comportamento
[ ] cd apps/api && npx tsc --noEmit → 0 erros
[ ] npx vitest run <novos arquivos> → verde
[ ] Registrei rota no server.ts (se for rota)
[ ] Atualizei PROGRESS_LOG.md com uma entrada
[ ] Commit direto no main (workflow do Lucas), sem trailer de IA
```
