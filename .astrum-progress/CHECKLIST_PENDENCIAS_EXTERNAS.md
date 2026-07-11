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
- [ ] Criar rota `POST /api/outages/notify` (rota HTTP de invocação ainda não criada)
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

> Código 100% completo (19 testes). Execução real aguarda 3–7 dias de tráfego espelhado.

### Pré-condições para ativação do shadow

- [ ] **Aplicar migrations** `023_shadow_results.sql` e `047_replay.sql` no Supabase de produção/staging
- [ ] **`FASTIFY_INTERNAL_URL`** — URL interna do Fastify (ex.: `http://localhost:3001` se co-localizado; ajustar se em container separado)
- [ ] **Subir o `message.worker`** (motor v2) para consumir a fila `astrum:messages` junto com o motor legado
- [ ] **Verificar log** `[shadow] resposta gravada` no dashboard da fila após primeira mensagem espelhada

### Observação (3–7 dias)

- [ ] Monitorar tabela `shadow_results` acumulando respostas
- [ ] Executar `POST /api/v2/ia/replay` com amostra ≥ 50 pares — verificar `pass_rate ≥ 0.95`
- [ ] Preencher `docs/port/SHADOW_REPORT.md` com dados reais (latência p95, custo/conversa, taxa de equivalência)

### Decisão de cutover (Lucas)

- [ ] **SHADOW_REPORT aprovado** — taxa ≥ 95 %, p95 ≤ legado, custo ≤ legado
- [ ] **Setar `ATENDIMENTO_ENGINE=v2`** em produção
- [ ] **Testar rollback** — trocar env de volta para `legacy` e confirmar que legado responde
- [ ] **Desligar `messageWorker` legado** após 48 h de estabilidade no v2

---

*Última atualização: 2026-07-11 (após S74)*
