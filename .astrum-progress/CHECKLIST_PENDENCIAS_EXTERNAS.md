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

### 🔴 BLOQUEIO REAL descoberto 2026-08-17: sem chave de LLM

- [ ] **Nenhuma chave de LLM funcional configurada** — `OPENAI_API_KEY` é placeholder
  (`sk-PLACEHOLDER-forneca-sua-chave`), sem `GEMINI_API_KEY`/`ANTHROPIC_API_KEY` no `.env`.
  O agente v2 (`langGraphService`) e o judge do replay (`gpt-4o-mini`) não geram nada sem isso.
  **Nem legado nem v2 respondem de verdade nesta máquina hoje** — não é questão de engine.
- [ ] **Ação do Lucas:** subir e conectar uma `OPENAI_API_KEY` ou `GEMINI_API_KEY` real.
- [ ] **Depois da chave:** rodar o replay (`POST /api/v2/ia/replay`, ou script direto —
  `executeReplayRun` não tem worker consumidor ainda, ver nota abaixo) contra o histórico
  real de `messages` (2 tenants, ~20 pares user→assistant cada) **antes de qualquer tráfego
  real de cliente** — isso É o "temos tudo sob controle" pedido pelo Lucas, só que como
  smoke-test pré-produção, não como gate de 3-7 dias.
- [ ] **Gap técnico achado:** a fila BullMQ `astrum-replay` (`replay.routes.ts`) não tem
  nenhum Worker consumidor implementado — hoje uma run enfileirada fica em `queued` pra
  sempre. Precisa de um worker (padrão dos outros workers do repo) OU chamar
  `executeReplayRun(runId)` direto via script pontual. Não é urgente enquanto não há chave.

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
- [ ] **Testar rollback** — trocar `ATENDIMENTO_ENGINE` de volta pra `legacy` e confirmar
  que o caminho legado ainda responde (relevante só depois que a Fase 4 apagar o Express —
  ver `PLANO_MIGRACAO_EXPRESS_FASTIFY.md`, o rollback muda de forma).
- [x] Não há `messageWorker` legado a desligar — ele já não bootava (gate `shouldBootWorker`
  respeita o flag desde que foi setado em 12/08).

---

*Última atualização: 2026-08-17 (sessão de execução S74 + achados de infra).*
