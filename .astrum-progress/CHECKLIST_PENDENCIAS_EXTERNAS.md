# CHECKLIST — Pendências que exigem dados/acessos externos

> Atualizado pela IA ao final de cada sessão P-XX.
> Cada item que NÃO pode ser resolvido sem dados reais (API key, instância de ERP, credencial) fica aqui.
> Itens que podem ser executados com Supabase local já são aplicados diretamente pela IA.

---

## Como usar

- **[ ] aberto** — ainda pendente, aguarda Lucas.
- **[x] feito** — Lucas confirmou ou IA aplicou.
- **[~] parcial** — executado com fallback/mock; precisa validação com dado real.

---

## MIGRATIONS (Supabase local)

| # | Migration | Status | Sessão |
|---|-----------|--------|--------|
| 062 | `p1_trust_unlock` | [x] aplicada pela IA | P1 |
| 063 | `p1_negotiation_policies` | [x] aplicada pela IA | P1 |
| 064 | `p1_outage_notifications` | [x] aplicada pela IA | P1 |
| 065 | `p2_meta_pages` | [x] aplicada pela IA | P2 |
| 066 | `p2_email_inboxes` | [x] aplicada pela IA | P2 |
| 067 | `p3_sales_leads` | [x] aplicada pela IA em 2026-07-11 | P3 |
| P4 | *(sem nova migration)* | [x] usa tabelas existentes: customers, invoices, service_orders | P4 |

> Próximas migrations serão aplicadas automaticamente pela IA via `tsx packages/db/src/migrate.ts`.

---

## CREDENCIAIS / CONFIGURAÇÕES DE AMBIENTE

### P2 — Omnichannel
- [ ] **META_WEBHOOK_VERIFY_TOKEN** — token para verificação do webhook Meta (Instagram/Messenger)
- [ ] **META_PAGE_ACCESS_TOKEN** — token de acesso à página Meta
- [ ] **FACEBOOK_APP_SECRET** — para validação de assinatura dos webhooks Meta
- [ ] **SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS** — para envio de e-mail via nodemailer
- [ ] **EMAIL_WEBHOOK_SECRET** — bearer token para o webhook de e-mail inbound

### P3 — Contrato digital
- [ ] **CLICKSIGN_API_KEY** — para envio de contratos via Clicksign *(prioridade)*
- [ ] **D4SIGN_API_KEY** — alternativa ao Clicksign (D4Sign)

---

## VALIDAÇÕES CONTRA ERP REAL

### P0 — Conectores ERP (adapter implementado, API real não testada)
- [ ] **IXC** — validar `IXCAdapter` contra instância real:
  - endpoints: `/webservice/v1/cliente`, `/fn_areceber`, `/radusuarios`, `/get_boleto`, `/cliente_desbloqueio_confianca`
  - P3 new: `/viabilidade`, `/plano_acesso`, `/cliente` (POST create), `/os` (POST create)
- [ ] **Voalle/Elleven** — validar `VoalleAdapter` contra instância real
- [ ] **MK Solutions / MK-Auth** — validar `MKAuthAdapter` contra instância real
- [ ] **SGP/TSMX** — validar `SGPAdapter` contra instância real
- [ ] **Hubsoft** — validar `HubsoftAdapter` contra instância real

### P1 — Religue por confiança
- [ ] Testar `trust_unlock_policies` com tenant real (verificar fallback para DEFAULT_POLICY se não existir)
- [ ] Testar `trust_unlocks` auditando o fluxo ponta-a-ponta com WhatsApp

### P1 — Notificação de falha em massa
- [x] Criar rota `POST /api/v2/outages/notify` — criada em 2026-07-12 (`outage-notifier.routes.ts`)
- [ ] Validar `outage_notifier.service.ts` enviando notificações reais via Evolution

### P3 — Funil de vendas
- [~] `checkViability` no IXC — implementado com `/webservice/v1/viabilidade`, precisa teste com instância real
- [~] `getPlans` no IXC — implementado com `/webservice/v1/plano_acesso`, precisa teste com instância real
- [~] `createPreRegistration` no IXC — implementado com `POST /webservice/v1/cliente`, precisa teste
- [~] `scheduleInstallation` no IXC — implementado com `POST /webservice/v1/os`, precisa teste

---

## WIZARD DE ONBOARDING (UX)

- [ ] **P0 — Wizard "conecte em 15 minutos"** — reusa `onboarding/wizard.ts`; UX coordenada com Onda 4

---

## TABELAS SUPABASE — Dados iniciais necessários para ativação

- [ ] **`trust_unlock_policies`** — inserir 1 linha por tenant piloto com a política personalizada (ou deixar vazio para usar DEFAULT: 2x/ano, R$200)
- [ ] **`negotiation_policies`** — inserir configuração de desconto/parcelamento por tenant piloto
- [ ] **`tenant_meta_pages`** — inserir `page_id + page_access_token` para cada tenant que usar Instagram/Messenger
- [ ] **`tenant_email_inboxes`** — inserir e-mail de entrada por tenant que usar e-mail
- [ ] **`tenant_erp_credentials`** — inserir credenciais criptografadas via `POST /api/v2/erp/credentials` (rota admin já existe)
- [ ] **`plans`** — inserir planos disponíveis para tenants sem ERP configurado (fallback do `getAvailablePlans`)

---

## P4 — Portal do assinante

- [ ] **`customers.cpf`** — popular campo `cpf` e `legacy_id` nos registros de clientes para tenants piloto (lookupSubscriberByCpf depende disso)
- [ ] **`customers.legacy_id`** — mapear nº contrato ERP para todos os clientes ativos (pode ser exportado do IXC/Voalle)
- [ ] Decidir domínio/URL do PWA portal do assinante (P4-01 frontend — coordenado com Onda 4)

---

## INTEGRAÇÕES EXTERNAS (acordos comerciais)

- [ ] **P6 — OZmap** — contrato de API para integração de planta (grafo de rede)
- [ ] **P6 — Anlix/Flashman** — contrato para telemetria CPE
- [ ] **P5-05 — Landing trial** — decisão de Lucas sobre domínio/hospedagem do trial self-service

---

---

## S74 — Shadow mode + cutover do atendimento

> **ATUALIZADO 2026-08-17 (decisão do Lucas):** o plano original (shadow 3–7d + replay ≥95%
> ANTES de virar a chave) foi abandonado porque nunca houve tráfego real pra observar
> (0 instâncias Evolution conectadas — ver abaixo) e não há sentido travar o motor v2
> esperando validação contra um legado que também nunca serviu cliente real por esse canal.
> `ATENDIMENTO_ENGINE=v2` **já estava setado no `.env` local desde 2026-08-12** (achado
> nesta sessão — os docs estavam desatualizados, o flag já tinha sido virado sem o gate
> formal). Decisão: manter v2 como default, sem bloquear em validação.

### Pré-condições (histórico)

- [x] **Aplicar migrations** `023_shadow_results.sql` e `047_replay.sql` — já estavam aplicadas; 068 e 069 aplicadas em 2026-07-11
- [x] **`FASTIFY_INTERNAL_URL`** — padrão `http://localhost:3001` funciona para co-localizado; em Docker usar URL do container `api`
- [x] **Subir o `message.worker`** — `createMessageWorker()` adicionado ao boot do Fastify em `apps/api/src/server.ts` (commit 9dcb7dd)
- [x] **`ATENDIMENTO_ENGINE=v2`** — já ativo em produção (`.env` linha 29, desde 2026-08-12)

### ✅ Chaves conectadas (2026-08-18) — mas replay ainda bloqueado (créditos)

- [x] **`OPENAI_API_KEY`** e **`GEMINI_API_KEY`** reais adicionadas ao `.env` (Lucas forneceu).
- [x] **`SUPABASE_SERVICE_ROLE_KEY`** também era placeholder (`iss: supabase-demo`) — achado
  e corrigido na mesma sessão. Isso é mais sério do que o LLM: sem essa chave, **nenhum
  processo local (incluindo o backend de produção nesta máquina) conseguia gravar/ler o
  Supabase real** — só o MCP (credencial própria do Claude) conseguia. Corrigido com uma
  chave `service_role` real fornecida pelo Lucas (formato novo `sb_secret_...`). Testado:
  `supabaseAdmin.from('tenants').select(...)` retorna dado real agora.
- [x] **🐛 BUG REAL achado e corrigido:** `CustomerIntentSchema.extracted_data` (schema Zod
  em `vercel-ai.service.ts`, usado pelo node de classificação de intenção do LangGraph) tinha
  campos `.optional()` dentro de um objeto aninhado — o modo `strict:true` da OpenAI
  Structured Outputs **exige que toda chave apareça em `required`** (não existe "opcional"
  de verdade nesse modo). Isso quebrava **100% das chamadas do motor v2**, mesmo com chave
  válida — todo `classifyIntent()` falhava com `400 invalid_json_schema`. Corrigido trocando
  `.optional()` → `.nullable()` (mesma semântica, mas aceito pelo schema strict). Testes
  atualizados (`vercel-ai.service.test.ts`, 11/11 verdes), typecheck limpo.
- [x] **🐛 2º BUG REAL achado e corrigido (`model-router.ts`):** `getProviderApiKey('google')`
  resolvia `GOOGLE_API_KEY`/`GEMINI_API_KEY`, mas `buildLanguageModel` chamava o `google()`
  default do `@ai-sdk/google` sem passar a key — esse SDK só reconhece
  `GOOGLE_GENERATIVE_AI_API_KEY` por conta própria. `getProviderApiKey()` virava teatro:
  dizia "tem key" (não pulava no failover) mas o client subia sem nenhuma → `LoadAPIKeyError`.
  Corrigido: `buildLanguageModel` agora usa `createOpenAI/createAnthropic/
  createGoogleGenerativeAI({apiKey})` explicitamente pra todos os 3 providers, em vez de
  confiar no lookup implícito de env var de cada SDK. Teste de regressão adicionado
  (`model-router.test.ts`, 36/36 verdes).
- [x] **🐛 3º achado (config, não bug de lógica):** `TIER_MODELS.google` apontava pra
  `gemini-2.5-flash`/`gemini-2.5-pro` — aposentados pela Google
  ("no longer available to new users"). Atualizado pra `gemini-3.6-flash`/`gemini-3.6-pro`
  (flash confirmado pela própria mensagem de erro da API; pro inferido pela convenção, não
  confirmado — revisar se a Google não seguir esse padrão exato).
- [x] **Geração de resposta do motor v2 confirmada funcionando de ponta a ponta via Gemini**
  (2026-08-18) — rodei o smoke-test 3 vezes até esgotar os bugs de credencial/schema/model-id
  acima; a última rodada teve **zero erros de schema/chave/modelo** nas 20 mensagens reais.
- [ ] **BLOQUEIO RESTANTE: o juiz do replay (`judgeOnePair`, em `replay.service.ts`) é
  hardcoded pro OpenAI** (`openai('gpt-4o-mini')` direto, não passa pelo `model-router`/
  failover) — e a `OPENAI_API_KEY` fornecida está sem crédito (`"You have no credits
  remaining"`). Isso NÃO bloqueia mais a geração de resposta em si (já comprovada via
  Gemini), só a métrica de equivalência do replay (`pass_rate`). **Ação do Lucas:** adicionar
  crédito em https://platform.openai.com/settings/organization/billing — depois disso o
  replay dá o `pass_rate` real. (Alternativa mais barata: portar o judge pra usar
  `withFailover`/Gemini também, já que ele já está pago — fica de sugestão, não fiz porque é
  mudança de comportamento do juiz, não só de credencial, prefiro seu aval antes.)
- [ ] **Depois de ter crédito (ou decidir mover o judge pro Gemini):** rodar
  `npx tsx -r dotenv/config scripts/replay/run-replay-smoke.ts` de novo (não precisa
  reiniciar nada, é script avulso) contra o histórico real de `messages` (2 tenants, ~20
  pares user→assistant cada) **antes de qualquer tráfego real de cliente**.
- [x] **Gap técnico RESOLVIDO (verificado 2026-08-23):** `createReplayWorker()`
  (`packages/queue/src/workers/replay.worker.ts`) já está importado e chamado
  incondicionalmente no boot (`apps/api/src/server.ts:749-750`), com `setupDLQ`+Sentry, gate
  próprio por `REPLAY_ENGINE_ENABLED` (=`true` no `.env` local). Consumidor real existe — a
  fila `astrum-replay` não fica mais presa em `queued` pra sempre. Não achei o commit exato
  (provavelmente entrou na sessão-maré de 17-18/08), só o registro aqui estava desatualizado.
- [x] **Chaves antigas no processo — RESOLVIDO por efeito colateral (2026-08-23):** o backend
  foi reiniciado várias vezes hoje (restart manual + teste ao vivo do healthcheck monitor, ver
  `astrum-backend-caiu-sem-monitoramento` na memória) — todo processo novo carrega o `.env`
  atual, então as chaves reais (Supabase/OpenAI/Gemini) já valem em produção agora.

### Realidade de tráfego (por que o risco de ter virado cedo é baixo)

- [x] **0 instâncias Evolution conectadas** (`tenant_evolution_instances` vazia) — nenhum
  tenant recebe mensagem real de WhatsApp hoje, então não há cliente afetado pela troca.
- [x] Os 2 tenants existentes têm dados claramente de seed/demo (mensagens em lote, mesmo
  timestamp) — não é tráfego de cliente real.

### Decisão de cutover — feita, mas sem evidência formal

- [x] **`ATENDIMENTO_ENGINE=v2`** já em produção — decisão tomada 2026-08-17 sem o gate de
  equivalência ≥95% (aceito pelo Lucas, dado que não havia como gerar essa evidência sem
  tráfego real nem chave de LLM).
- [ ] Rodar o smoke-test de replay assim que houver chave (ver acima) — não bloqueia nada,
  é validação, não gate.
- [x] **🔴 Testado — rollback está QUEBRADO (achado 2026-08-23, pós Fase 4).** A Fase 4
  (17-18/08) apagou `server.ts` raiz e `src/routes/evolutionWebhook.ts` (Express) por completo.
  Isso destruiu o caminho de rollback sem ninguém perceber: `resolveEvolutionWebhookMode()`
  (`engine-flags.ts`) — a função que decidia "processa local + espelha" vs "repassa pro v2" —
  **não tem mais nenhum caller em código de produção** (só aparece no próprio teste unitário
  do engine-flags; `evolution-webhook.routes.ts`, a rota v2 real, nunca a chama). Da mesma
  forma, `shouldBootWorker('atendimento', 'legacy')` também só existe no teste — nenhum lugar
  do `server.ts` chama isso pra decidir se sobe o `messageWorker.ts` legado. **Na prática, hoje
  `ATENDIMENTO_ENGINE=legacy` não restaura o atendimento antigo — só põe o worker v2 em modo
  sombra (processa mas não envia nada).** Ou seja: setar essa env de volta pra `legacy` hoje
  = desligar as respostas automáticas, não reverter pro comportamento antigo. `src/workers/
  messageWorker.ts` (67KB) ainda existe no disco mas está órfão — nada mais o invoca.
  **Risco real:** baixo hoje (0 instâncias Evolution conectadas, nenhum tenant real usa
  WhatsApp ainda — ver "Realidade de tráfego" acima), mas isso precisa ficar resolvido
  ANTES do primeiro tenant real ir pro ar, porque a rede de segurança "rollback = trocar a
  env" que o plano original prometia não existe mais. **Duas saídas, decisão do Lucas:**
  (a) deletar `messageWorker.ts` + a lógica `legacy`/shadow morta em `engine-flags.ts` de vez
  (R5 já permite — v2 é quem recebe tráfego de produção hoje, não sobra "legado" de verdade
  pra reverter); ou (b) se ele quiser MANTER um rollback de verdade, seria preciso reconstruir
  um caminho de emergência (não é reativar o antigo — ele já não existe fisicamente).

---

*Última atualização: 2026-08-23 (verificação do balde B — replay worker, chaves e rollback).*
