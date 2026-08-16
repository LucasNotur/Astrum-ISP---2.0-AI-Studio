# PLANO FASE 2 — CONTINUAÇÃO (sessão limpa) — fechar 2-A.6 webhooks + 2-A.7 ai/ask

> Escrito 2026-08-15 pelo Claude Opus 4.8 (sessão de diagnóstico). A sessão de EXECUÇÃO começa
> limpa — este doc é a fonte da verdade pra retomar. Cruza com `PLANO_FASE2__EM_ANDAMENTO.md`,
> `HANDOFF_FASE2_SPECS.md` e a memória `astrum-migracao-express-fastify`.

## Estado ao entrar (o que já está feito — NÃO refazer)
Fase 2-A: **6 de 8 rotas portadas + no main + auditadas**: os, super-admin, jobs, cobrai
(monitor+send-now+DELETE), evolution/proxy, dlq. HEAD `141e78b`. Baseline tsc apps/api = **56 erros
pré-existentes** (critério: não aumentar + 0 nos arquivos novos). `npm run typecheck:legacy` = 0.
Modo de trabalho: **híbrido / "Camisa 9"** — o modelo caro faz DB/segurança/decisão/auditoria; o
braçal vai pro DeepSeek (OpenGo) via spec blindado em `HANDOFF_FASE2_SPECS.md`; o Claude audita o
código REAL (git diff + typecheck + teste) antes do push.

## Recomendação de MODELO (decisão delegada ao Claude)
**Rodar a sessão de execução em `claude-sonnet-5` (Sonnet 5), não Opus 4.8.** Porquê:
- O trabalho que resta é **wiring + migration + verificação**, não "inventar segurança do zero" — a
  infra sensível já existe (HMAC plugin cobre evolution/facebook; worker v2 já trata lockout/invoice.paid;
  asaas.adapter pronto). Este doc já fez o diagnóstico caro (o que era o papel do Opus).
- Sonnet 5 tem **tool access completo** (Supabase MCP, git, testes) — faz migration + roda e verifica
  sozinho, diferente do DeepSeek. E custa ~5× menos que Opus → os $50 rendem MUITO (o resto todo deve
  custar poucos dólares em Sonnet).
- **Quando subir pra Opus:** só se aparecer algo genuinamente gnarly na paridade de HMAC do asaas ou
  numa decisão de lockout ambígua. Não por default.
- Braçal residual (se houver repoint de front) → DeepSeek, como sempre.

## Fatos-chave descobertos (para não reinvestigar)
- `webhook-hmac.plugin.ts` (v2) já valida HMAC sobre **raw-body, fail-closed**, e o mapa
  `WEBHOOK_ROUTES` já cobre `/api/webhook/evolution`, `/api/v2/webhook/evolution`,
  `/api/webhook/facebook`, `/api/v2/webhook/facebook`. **NÃO cobre asaas** (precisa adicionar).
- `meta-webhook.routes.ts` já registrado no `apps/api/src/server.ts` (linha ~246). Precisa da tabela
  `tenant_meta_pages (page_id PK, tenant_id, page_type in(instagram,messenger), page_access_token)`
  + RLS — ver o cabeçalho do próprio arquivo (migration que o Lucas ainda não aplicou).
- asaas v2: existe `gateway-sync.routes.ts` (`POST /api/v2/gateway/asaas/sync`, pull→invoices),
  `asaas-sync.service.ts`, `adapters/gateway/asaas.adapter.ts`. **Falta o webhook de ENTRADA.**
- worker v2 `packages/queue/src/workers/cobrai.worker.ts` já trata `job.name` = `lockout_tenant`
  (suspende tenant com `tenants.billing_status='overdue'`) e `invoice.paid` (reativa cliente + svix).
- Legado a remover por R5 (só DEPOIS de portar+validar): `src/routes/facebookWebhook.ts`,
  `src/routes/evolutionWebhook.ts`, e o `asaasWebhookHandler` de `src/lib/billing.ts` + os mounts em
  `server.ts` raiz (linhas ~135-140). ⚠️ o webhook Evolution legado tem o **shadow S74** (espelha pro
  v2) — não remover até o cutover.

---

## TAREFA 1 — asaas webhook v2 (BUILD) — ✅ CONCLUÍDA (2026-08-16, commit `e3b1888`)

**Entregue:** `POST /api/v2/webhook/asaas` (token `asaas-access-token`, fail-closed timing-safe,
`ASAAS_WEBHOOK_SECRET`). Resolve a invoice por `external_id` (setado pelo sync F6-02) — nunca por
tenantId do request. RECEIVED/CONFIRMED/RECEIVED_IN_CASH → `invoices.status='paid'` + job
`invoice.paid` na fila `cobrai`. OVERDUE → `status='overdue'`. DELETED → `'cancelled'`. Idempotente
via Redis (dedup por evento+payment.id, TTL 7d). Arquivos: `asaas-webhook.service.ts` (+test),
`asaas-webhook.routes.ts`, registro em `server.ts`, env em `.env.example`.

**Decisão registrada (fora de escopo):** o branch `lockout_tenant` do legado (Astrum suspende o
ISP por inadimplência DELE com a Astrum) **não foi portado**. Verificado via MCP: `tenants` não tem
colunas `billing_status`/`status`/`asaas_customer_id` — só `plan`/`subscriber_count` (modelo
R$2,50/assinante, ver memória `astrum-precificacao-escada`). Nenhum tenant tem esse dado hoje; essa
frente de cobrança (Astrum→ISP via Asaas) nunca foi ativada em produção. Precisa de migration +
decisão do Lucas sobre COMO a Astrum cobra o ISP antes de reconstruir — não é webhook mecânico.

**Bug pré-existente descoberto e corrigido no caminho (mesmo commit):** `cobrai.worker.ts` escutava
a fila `'astrum:cobranca'`, mas `priority-queues.ts` cria a Queue como `'cobrai'` — nomes diferentes,
BullMQ nunca conecta Queue→Worker. Isso significa que **`send-now` (cobrai-dispatch, SPEC C) e o
retry do DLQ pra fila cobrai (SPEC B) já estavam mergeados e "✅ concluídos" mas inertes** — jobs
enfileirados, nunca consumidos. Não estourou em produção só porque `createCobraiWorker()` também
nunca era chamado em `server.ts` (os dois bugs se mascaravam). Corrigido: nome unificado + worker
agora sobe no boot (auto-guardado por `COBRAI_ENGINE=v2`). **Ação recomendada:** re-testar
`send-now`/DLQ-retry manualmente agora que a fila está de fato conectada (não fizeram parte desta
sessão — só a causa raiz foi corrigida).

---

## TAREFA 1 (texto original do plano, referência)
**Objetivo:** `POST /api/v2/webhook/asaas` recebendo eventos do Asaas (PAYMENT_RECEIVED / PAYMENT_OVERDUE
/ PAYMENT_CONFIRMED etc.) com HMAC fail-closed, disparando lockout de inadimplente / marcando invoice paga.

1. **Ler o legado primeiro:** `asaasWebhookHandler` em `src/lib/billing.ts` (é o comportamento a
   reproduzir: hoje faz auth timing-safe + PAYMENT_OVERDUE → job lockout). Confirmar o shape do evento
   Asaas real (campos `event`, `payment.{customer,invoice,status}`).
2. **HMAC:** adicionar `'/api/v2/webhook/asaas': 'asaas'` ao `WEBHOOK_ROUTES` do
   `webhook-hmac.plugin.ts` **E** garantir que `validateWebhookSignature(..., 'asaas')` conheça o
   provider 'asaas' (checar `hmac.service.ts` — se não tiver o secret do asaas, adicionar via env
   `ASAAS_WEBHOOK_SECRET`). Asaas usa um token no header `asaas-access-token` (não HMAC clássico) —
   **verificar o mecanismo real do Asaas**; pode ser comparação timing-safe de token, não HMAC. Se for
   token, o guard vai no handler (timing-safe), não no plugin HMAC. DECIDIR com base no doc do Asaas.
3. **Handler v2:** service PURO (`asaas-webhook.service.ts`) que mapeia evento→ação
   (`PAYMENT_OVERDUE`→enfileirar `lockout_tenant`; `PAYMENT_RECEIVED/CONFIRMED`→`invoice.paid` +
   update `invoices.status='paid'`), + rota fina que valida token, resolve tenant (via
   `asaas_customer_id`/`external_id` em invoices/subscriptions), enfileira na fila `cobrai`
   (`queues.cobrai.add(jobName, {tenantId, customerId, invoiceId, ...})`). Teste do service (mapa de
   eventos). Registrar em server.ts.
4. **Front:** nenhum (é webhook de provider). **R5:** remover `asaasWebhookHandler` mount de `server.ts`
   raiz SÓ depois de apontar o Asaas pro v2 (config externa do Lucas) — deixar os dois no ar durante a
   transição é aceitável (idempotente por invoice).
5. ⚠️ **Sensível (checklist de auditoria):** fail-closed (assinatura/token inválido → 401, NUNCA
   processa); idempotência (mesmo evento 2×  não loga 2×); tenant resolvido server-side; lockout só
   dispara com `billing_status='overdue'` real (o worker já checa). Testar com evento forjado.

## TAREFA 2 — facebook/meta webhook — ✅ CONCLUÍDA (2026-08-16, migration `102_tenant_meta_pages.sql`)

**Entregue:** tabela `tenant_meta_pages(page_id PK, tenant_id FK, page_type check(instagram|messenger),
page_access_token, created_at, updated_at)` aplicada via MCP + registrada em `schema_migrations`
(checksum `a4a08d9697d3b7f8`). RLS no padrão atual do projeto (`ENABLE`+`FORCE`, policy
`tenant_own_*` via `get_tenant_id()`, policy `super_admin_all_*`, REVOKE de `anon`). `get_advisors`
rodado depois: nenhum warning novo sobre essa tabela. Path é `/api/v2/webhook/meta` (GET verify +
POST), não `/api/v2/webhook/facebook` — o meta-webhook.routes.ts já expõe esse path, não precisou
mudar. Adicionado `META_WEBHOOK_VERIFY_TOKEN` ao `.env.example` (não configurado em lugar nenhum
ainda — precisa de valor real).

**Verify de fato (o que deu pra verificar sem deploy):** conferido por leitura que
`resolveTenantByPageId`/`extractMetaMessages` fazem o mesmo que o `facebookWebhookRouter` legado
(resolve por page_id, ignora echo/delivery sem `message.text`, enfileira na fila `astrum-messages`
— **essa é a mesma fila que o worker v2 `message.worker.ts` escuta**, já confirmado sem o problema
de nome que achei no cobrai). Rodei um INSERT/SELECT/DELETE real via MCP contra `tenant_meta_pages`
pra confirmar que o shape da tabela bate exatamente com a query que o código faz — passou. **Não deu**
pra testar o handshake HTTP real (GET com `hub.challenge`) porque isso exige o Meta chamando um
servidor publicado + token real configurado no painel do app Meta — ambos são "config externa" (item
3 abaixo), fora do meu alcance nesta sessão.

**⚠️ Achado à parte (não é bug, é uma trava de ambiente):** tentei rodar um script local (`tsx`) contra
o Supabase real pra verificar via código de app (não SQL direto) e tomei "Invalid API key" — o
`SUPABASE_SERVICE_ROLE_KEY` no `.env` da raiz é um valor placeholder/demo (`iss: supabase-demo` no
JWT), não a chave real do projeto `dnisztuafnpzlkutgbiw`. O MCP do Supabase autentica por fora (chave
própria), por isso minhas verificações via `execute_sql`/`apply_migration` funcionam normalmente — mas
**nenhum script local nem o servidor Fastify rodando localmente vai conseguir falar com o Supabase real**
até esse valor ser trocado pelo de verdade. Não mexi nisso (é credencial, fora do meu alcance decidir
sozinho) — só registrando pra não perder tempo re-descobrindo isso numa sessão futura.

**Pendente (não é desta tarefa):** popular `tenant_meta_pages` por tenant real (page_id + token da
página) — hoje só dá pra inserir via SQL direto, não existe UI/rota admin ainda. Se for usado de
verdade em breve, pode valer uma rota simples de CRUD (fora do escopo mecânico desta tarefa).

**R5 (remoção do legado):** **NÃO removido** — `src/routes/facebookWebhook.ts` continua montado.
Só remover depois do cutover real (Meta apontando pro `/api/v2/webhook/meta` em produção + confirmado
recebendo tráfego).

---

## TAREFA 2 (texto original do plano, referência)
1. **Migration `tenant_meta_pages`** (Claude/Sonnet via MCP): criar a tabela do cabeçalho de
   `meta-webhook.routes.ts` + RLS tenant_own + registrar em `schema_migrations`
   (checksum sha256(sql).slice(0,16)).
2. **Verificar** que `meta-webhook.routes` resolve tenant por `page_id` e enfileira na `astrum-messages`
   igual o legado (`facebookWebhookRouter`). Conferir `META_WEBHOOK_VERIFY_TOKEN`/`FACEBOOK_APP_SECRET`.
3. **Config externa (Lucas):** apontar o webhook do app Meta para `/api/v2/webhook/meta` (ou manter
   `/api/v2/webhook/facebook` — conferir qual path o meta-webhook expõe).
4. **R5:** remover `src/routes/facebookWebhook.ts` + mount só depois do cutover do provider.
5. ✅ **Confirmado pelo dono (2026-08-15): Meta EM USO / uso iminente** → criar a migration
   `tenant_meta_pages` e fazer o verify de fato (NÃO adiar). Facebook está no escopo de fechar a 2-A.

## TAREFA 3 — evolution webhook (CUTOVER, não build)
Não construir. v2 pronto (shadow). Documentar que o corte é ligar `ATENDIMENTO_ENGINE=v2` (S74) e então
remover `src/routes/evolutionWebhook.ts`. **Não** mexer no shadow até o cutover.

## TAREFA 4 — /api/ai/ask (CUTOVER S74, defer)
Não forçar agora. É o `getAIResponse` client (teste de agente + simulação no chat) cujo substituto é
`/api/v2/chat/stream` (contrato incompatível: single-msg SSE vs history+session_state). Fica junto do
cutover de atendimento. Registrar como pendência do cutover, não da Fase 2-A "mecânica".

---

## Ordem sugerida na sessão nova
1. Ler este doc + `HANDOFF_FASE2_SPECS.md` (contrato) + `git log --oneline -8`.
2. **TAREFA 1 (asaas)** — o único build real; começar lendo `src/lib/billing.ts` + doc do webhook Asaas.
3. **TAREFA 2 (facebook)** — migration + verify (confirmar uso real antes).
4. Documentar TAREFA 3 e 4 como cutover-gated → **Fase 2-A "mecânica" fechada**; sobra só o cutover S74.
5. Cada entrega: service puro + teste, typecheck (não aumentar baseline 56 + legado 0), commit "fatia
   limpa" (revisar diff, `git add` exato), push no main. Auditar antes de subir se veio do DeepSeek.

## Definition of Done da Fase 2-A
asaas v2 no ar + facebook migrado/verificado (ou adiado com aval do dono) + evolution/ai-ask documentados
como cutover-gated. Aí a Fase 2-A está fechada e o próximo marco é a **Fase 3** (SPA fora do Express) →
**Fase 4** (aposentar Express: rm `server.ts` raiz + `src/routes/*` restantes).

---

## ✅ FASE 2-A "MECÂNICA" FECHADA (2026-08-16)

Placar final: os / super-admin / jobs / cobrai (monitor+send-now+DELETE) / evolution-proxy / dlq /
**asaas** / **facebook-migration** = 8 de 8 rotas portadas e no main. TAREFA 3 (evolution) e TAREFA 4
(ai/ask) documentadas acima como cutover-gated (S74) — não é trabalho mecânico pendente, é decisão de
corte que já tem plano.

**Dois achados desta sessão que não eram do escopo original mas bloqueavam entregas já "concluídas"
em sessões anteriores** (ver detalhe nas seções TAREFA 1 e TAREFA 2 acima):
1. Fila `cobrai`: Worker escutava `'astrum:cobranca'`, Queue criava `'cobrai'` — send-now e
   DLQ-retry-pra-cobrai (ambos ✅ de sessões passadas) enfileiravam pro vazio. Corrigido + worker
   agora sobe no boot (antes nunca era chamado). **Recomendo re-testar manualmente** send-now e
   DLQ-retry pra confirmar o fim-a-fim, já que só a causa raiz foi corrigida aqui.
2. `SUPABASE_SERVICE_ROLE_KEY` no `.env` da raiz é placeholder/demo — scripts locais (`tsx`) ou o
   Fastify local não conseguem falar com o Supabase real. Só o MCP (chave própria) consegue. Não é
   bug de código, é credencial ausente — sinalizando pra não perder tempo re-descobrindo isso.

**Próximo marco:** Fase 3 (SPA fora do Express) → Fase 4 (aposentar Express). Ou, se o dono preferir,
o cutover S74 (`ATENDIMENTO_ENGINE=v2` + `COBRAI_ENGINE` já é v2 localmente — conferir se é intencional
em produção) antes de seguir pra Fase 3.
