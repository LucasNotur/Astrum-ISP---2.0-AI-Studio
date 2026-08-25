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

## [ ] F1-D — Migrar as páginas restantes do inventário
**Modelo:** DeepSeek V4 Pro
Idêntica à F1-A, para TODAS as páginas restantes do inventário F1-INV (Monitoring,
QualityMonitor, OnboardingWizard, KnowledgeBase, AIConfig, AICosts, AIObservability,
SuperAdmin, Inventory, SecurityPage, OperatorMobile, ERPIntegrations, intelligence/*, e
quaisquer outras que o inventário liste). Pode ser dividida em 2 sessões se ficar grande —
nesse caso commitar cada metade separadamente. Mesma verificação e DoD.

## [ ] F1-AUD — Auditoria dos lotes F1 antes do push
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

## [ ] C1 — Option A na cobrança (repetir a decisão do atendimento)
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

## [ ] D1 — npm audit fix + bumps dirigidos
**Modelo:** DeepSeek V4 Pro *(ou Sonnet 5 — ambos capazes)*
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

## [ ] D2 — Enxugar as 84 dependências da raiz
**Modelo:** DeepSeek V4 Pro
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

## [ ] AUD-G — Auditoria geral dos lotes D1/D2/S3/L1 + push
**Modelo:** Claude Sonnet 5
Mesmo protocolo da F1-AUD (diff completo de `origin/main..HEAD`, rodar suites, procurar
teste enfraquecido, push se ok). Checklist extra: (a) nenhum bump de major sem registro;
(b) nenhuma dep removida que aparece em grep; (c) lockfile coerente (`npm ci` limpo).

---

# FASE 4 — Segurança fina

## [ ] S1 — [MCP] Auditoria dos 5 arquivos com client Supabase anônimo no apps/api
**Modelo:** Claude Sonnet 5 no Claude Code *(precisa do Supabase MCP)*
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

## [ ] S2 — [MCP] Funções SECURITY DEFINER + tabelas deny-all
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

## [ ] S3 — Helper único getTenantId() + regra de lint
**Modelo:** DeepSeek V4 Pro *(mecânico e bem delimitado — ou Sonnet 5)*
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

## [ ] L1 — Deletar código morto verificado
**Modelo:** DeepSeek V4 Pro
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

## [ ] L2 — Atualizar CLAUDE.md para o estado real
**Modelo:** Claude Sonnet 5 *(é o mapa que as IAs leem — precisão importa mais que custo)*
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

## [ ] B1 — [MCP] Índices em FKs quentes + limpeza de índices
**Modelo:** Claude Opus 5 / Fable 5 no Claude Code *(DDL em produção)*
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

## [ ] I1 — Plano de migração para VPS
**Modelo:** Claude (Sonnet 5 para o doc; decisões com o Lucas)
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

## [ ] I2 — Separar workers da API (pós-VPS — não executar agora)
Hoje `apps/api/src/server.ts` (861 linhas) sobe a API + 20+ workers no mesmo processo
Node — um worker vazando memória derruba a API. Depois da VPS: processo dedicado
(`workers.ts` bootando os `createXWorker()` de `packages/queue`, API sem workers), 2
processos no process manager. Registrado para não se perder; spec detalhada será escrita
quando a I1 concluir.

---

# ORDEM DE EXECUÇÃO RECOMENDADA

```
F1-INV → F1-A → F1-B → F1-C → F1-D   (DeepSeek, em série — F1-AUD após cada lote ou no fim)
C1 (Claude Sonnet)                    (independente — pode rodar em paralelo à Fase 1)
D1 → D2 → S3 → L1                     (DeepSeek, em série — AUD-G no fim)
S1 → S2 → B1                          (Claude com MCP — após reset dos créditos)
L2                                    (Claude Sonnet — só após C1 e L1)
I1                                    (Claude + Lucas — quando quiser atacar a VPS)
```

Dependências duras: F1-A/B/C/D ← F1-INV · L2 ← C1+L1 · I2 ← I1.
Tudo o mais é independente entre si.

---

# ACHADOS COLATERAIS (executores anotam aqui, NÃO consertam)

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
  - `ChatPage.tsx:513` — update de `customers` com `document`/`plan`/`tenantId`: colunas
    reais são `cpf`/`plan_id`/`tenant_id` (nomes diferentes, não é só RLS).
  - `WhatsAppPage.tsx:97` — `tenants.evolution_instances` (plural, array): a coluna real é
    `evolution_instance` (singular, texto único — não suporta múltiplas instâncias).
  - `WhatsAppPage.tsx:99` — upsert em `tenant_evolution_instances` com `label,
    phone_number, ai_enabled`: a tabela real só tem `id, tenant_id, instance_name, status,
    created_at` — essas 3 colunas não existem.
  Antes de migrar essas 7, alguém (produto + engenharia) precisa decidir, por caso: criar
  migration com a coluna/tabela que falta, ou tratar como feature morta e remover da UI.
  Não é uma tarefa "portar query pra rota" — é desenho de schema.
- **[F1-C, 2026-08-25 — schema real ≠ o que o código assume, verificado via MCP
  `execute_sql` contra `information_schema.columns` ANTES de escrever qualquer rota]**
  26 das 31 ocorrências de `SettingsPage.tsx` (+ 1 fora do grep, ver linha 148 abaixo)
  gravam/leem colunas ou tabelas que **não existem** — bug pré-existente, não é RLS. Não
  migradas nesta tarefa (decisão do Lucas: só migrar o seguro agora, mesmo protocolo da
  F1-B). Agrupadas por causa raiz:
  - **`tenants.sso_config`** (linhas 375, 402, 409, 460) — coluna não existe. SSO/domínio
    customizado fica sem persistência real.
  - **`tenants.theme`** (linhas 402, 409) — coluna não existe. Branding (cores/logo/fonte)
    nunca é salvo de fato.
  - **`tenants.vector_store_config`** (linhas 460, 488) — coluna não existe. Config do
    banco vetorial (Qdrant/provider/url/apiKey) não persiste.
  - **`knowledge_articles.vector_indexed`** (linha 463) — coluna não existe na tabela real
    (`id, tenant_id, document_id, title, content, category, tags, ingest_status,
    legacy_id, extra, created_at, updated_at`); contagem de artigos indexados sempre falha.
  - **`tenants.monthly_token_limit` / `worker_concurrency` / 7 campos `backup_*`**
    (linhas 511, 531, 784) — nenhuma dessas 9 colunas existe. Limites de IA e config de
    backup (bucket/projeto GCP/hora/retenção/status) não persistem.
  - **`tenants.holidays`** (linhas 545, 559, 576, 588) — coluna não existe. Lista de
    feriados (nacional + manual) nunca é salva; `holidays.routes.ts` já reconhecia isso
    num comentário próprio (citado na F1-INV), agora confirmado que a causa não é só RLS —
    a coluna nunca existiu.
  - **`role_permissions`** (linha 303) — schema real é `(id, role, resource, action)`
    (RBAC global estático, tabela deny-all mencionada na S2 do plano), não
    `(tenant_id, role_name, permissions jsonb)` como o código assume. O upsert falharia
    mesmo com grants de `anon` restaurados — é tabela errada pro conceito, não coluna
    faltando. Matriz de permissões por role/tenant não tem onde ser persistida hoje.
  - **`tenants.integrations`** (linhas 1040, 1217, 1242, 1267, 1345, 1368, 1400, 1680,
    1703, 1726 — os 10 provedores não portados pra `integration-keys` cifrada) — coluna
    não existe (só `integration_keys`, a nova/cifrada, existe). Já era achado colateral da
    F1-INV como "grava em coluna plaintext antiga"; agora confirmado que nem a coluna
    antiga existe mais — o `update` falha por completo, não é um problema de cifra/schema
    novo vs. antigo, é ausência total de destino.
  - **`saveCompanySettings`** (linha 858) — `supabase.from('tenants').update(cleanSettings)`
    espalha as chaves de `companySettings` (`name, logoUrl, supportEmail, supportPhone,
    workingHours, timezone` — default em `useAppStore.ts:227`) como nomes de coluna
    direto. Só `name` existe na tabela real; as outras 5 fariam o update inteiro falhar
    (Postgres rejeita update com coluna inexistente). Padrão perigoso à parte do bug de
    schema: se algum dia a coluna existir, esse handler aceita gravar QUALQUER chave que
    estiver no estado do Zustand sem allowlist — vale revisitar quando for desenhado.
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
