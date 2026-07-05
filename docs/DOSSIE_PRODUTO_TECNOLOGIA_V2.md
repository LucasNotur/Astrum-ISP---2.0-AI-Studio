# DOSSIÊ ASTRUM — Produto, Tecnologia e Conformidade de UI (V2)

> Auditoria completa executada em 2026-07-02, pós-conclusão do Plano Mestre V2 (S68–S98).
> Método: varredura de código com evidência (grep/rotas/arquivos), não inferência.
> Escopo: 12 blocos tecnológicos × 23 rotas de UI × jornada completa do dono de ISP.

---

## 0. VEREDITO EXECUTIVO

A Astrum hoje é um **motor de plataforma de nível enterprise com um cockpit de nível MVP**.
O backend cobre ~90% dos 12 blocos (748 testes verdes), mas o frontend expõe **pouco mais da
metade** dessa capacidade ao usuário. O dono de ISP consegue operar o dia a dia (atendimento,
clientes, OS, cobrança, equipe), porém **não consegue ver nem controlar** boa parte do que o
motor faz por baixo: custo de IA, qualidade do RAG, webhooks de saída, saúde por ISP,
credenciais ERP cifradas, flags de migração e os 5 módulos novos (crise, telemetria, portal
do assinante, voz, benchmarking).

**Três achados críticos** (detalhados nas seções 3 e 4):

1. **A camada de dados do frontend NÃO está em conformidade**: 18 das 22 páginas ainda
   importam Firestore direto e **0 páginas usam a abstração `src/repositories/`** — a factory
   do data-swap (S78) existe e defaulta para Supabase, mas as telas passam por fora dela.
2. **Regressão de MFA**: o login foi migrado para Supabase (S77 ✅), mas os componentes de
   MFA eram do Firebase (`MfaLoginResolver`, `MfaRequirement`) e ficaram órfãos → o produto
   perdeu 2FA até reimplementar via Supabase TOTP.
3. **10+ capacidades backend sem NENHUMA superfície de UI** — inclusive as que o dono de ISP
   precisa para confiar no produto (custo por conversa, orçamento de IA, saúde do WhatsApp).

---

## 1. INVENTÁRIO — 12 BLOCOS × ESTADO ATUAL (pós-S98)

Legenda: **BE** = backend | **FE** = frontend/UI | ✅ completo | 🔶 parcial | ❌ ausente

| Bloco | BE | FE | Situação real |
|---|---|---|---|
| **B01 LLMs & FinOps** | ✅ | 🔶 | Router, batch, prompt-cache, fallback multi-provider (S72) e orçamento de IA (S97) prontos. UI: AIConfigPage configura personas/modelos, mas **não existe tela de custo por conversa/tenant (Helicone) nem de orçamento** — o dono não vê quanto a IA custa. |
| **B02 Guardrails** | ✅ | 🔶 | Pipeline PII→Injection→Moderation testado. UI: AIConfigPage tem configurações de IA; falta painel de **eventos bloqueados** (o operador não sabe quando/por que a IA recusou). |
| **B03 RAG & Memória** | ✅ | 🔶 | Hybrid+HyDE+Zep+RAGAS (S87). UI: KnowledgeBasePage faz upload/gestão; **RAGAS/qualidade sem tela** (nem em AIObservabilityPage). |
| **B04 Agentes** | ✅ | 🔶 | LangGraph 8 nós + tools reais (S72) + guards CobrAI (S76). UI: CobrAIPage + AIConfigPage (janela/limite hora ✅ têm UI). Falta visualização do fluxo do agente por conversa (debug do operador). |
| **B05 Dados** | ✅ | 🔶 | 27 migrations aplicadas no Supabase local; ETL+delta prontos. UI: **18 páginas ainda no Firestore** (ver §3.1) — o dado que a tela mostra não é o dado que o motor novo escreve. |
| **B06 Mensageria** | ✅ | ✅ | BullMQ+Outbox+DLQ. UI: rotas admin de filas/DLQ existem (6 arquivos com tela). OK. |
| **B07 Backend Core** | ✅ | — | Fastify v2 bota (fix dotenv 2026-07-02). 26 rotas /api/v2 expostas. |
| **B08 Frontend** | — | 🔶 | 23 rotas, 22 páginas (870 KB de TSX). Rico em operação, pobre em administração da plataforma. Monólitos: SettingsPage 128 KB, AIConfigPage 140 KB. |
| **B09 Segurança** | ✅ | 🔶 | Argon2id, RLS, HMAC, anti-IDOR (S85), force_reset (S77). UI: login Supabase ✅ novo; **MFA regressão** (componentes Firebase órfãos); sem tela de audit_log; sem tela LGPD (right-to-be-forgotten S85 sem botão). |
| **B10 DevOps** | 🔶 | — | Compose ok, engine-flags por env+tenant. Pulumi segue ausente. Launchers .bat criados (Desktop\Astrum). |
| **B11 Observabilidade** | ✅ | 🔶 | Sentry/LangSmith/Pino/health-score (S88)/cost-budget (S97). UI: MonitoringPage + AIObservabilityPage existem, mas **health-score por ISP e sonda sintética não aparecem em nenhuma** delas. |
| **B12 Padrões** | ✅ | — | DDD, Strangler (flags), Outbox, gates testáveis (readiness/go-live/final). |

**Módulos novos (S92–S96): 5/5 com lógica testada, 0/5 com UI ou worker ligado.**

---

## 2. MATRIZ BACKEND ↔ FRONTEND (a pergunta central)

Para cada capacidade: existe UI? **precisa** de UI? onde deveria morar?

### 2.1 SEM UI — e PRECISA (o dono/operador precisa ver ou mexer)

| Capacidade (sessão) | Quem usa | Onde deve morar | Prioridade |
|---|---|---|---|
| Custo IA por tenant + orçamento/hard-stop (B01/S97) | Dono do ISP | **Nova aba "Custos & IA"** no BIPage ou página própria | **P0** |
| Health score por ISP + sonda sintética (S88) | Dono + Astrum | MonitoringPage (por tenant) + SuperAdminPage (todos) | **P0** |
| Credenciais ERP cifradas (S75, `tenant_erp_credentials`) | Dono do ISP | SettingsPage → aba Integrações (hoje só tem campo solto de HubSoft/Asaas) | **P0** |
| Webhooks de saída Svix (S90) — endpoints, entregas, retries | Dono técnico | SettingsPage → nova aba "Webhooks" (rotas `/api/v2/webhooks/*` JÁ existem) | P1 |
| Eventos de guardrails bloqueados (B02) | Operador/gestor | AIObservabilityPage | P1 |
| RAGAS / qualidade do RAG (S87) | Gestor | AIObservabilityPage ou QualityMonitorPage | P1 |
| Audit log de segurança (B09) | Dono/compliance | SettingsPage → aba "Auditoria" | P1 |
| LGPD: right-to-be-forgotten (S85) | Dono/DPO | CustomersPage → ação no cliente ("Expurgar dados") | P1 |
| Benchmarking setorial (S96) | Dono | BIPage → seção "Você vs o Setor" | P1 |
| Relatório ANATEL (S96) | Dono/regulatório | BIPage → exportação | P1 |
| Crise massiva — war-room (S92) | Gestor de plantão | DashboardPage (banner de incidente) + página de crise | P2 |
| Telemetria óptica/alertas proativos (S93) | NOC/técnico | MapPage (camada de saúde de CTO) | P2 |
| Voz — console de chamadas (S95) | Operador | ChatPage (aba "Chamadas") | P2 |
| Portal do assinante (S94) | Cliente FINAL do ISP | **App separado** (PWA própria, não entra no painel) | P2 |

### 2.2 SEM UI — e está CORRETO ser backend-only (mas precisa de UI de super-admin)

| Capacidade | Justificativa | Onde expor minimamente |
|---|---|---|
| Engine flags (COBRAI/ATENDIMENTO_ENGINE, canário por tenant) | Controle de migração — perigoso demais para o dono do ISP | **SuperAdminPage**: "Central de Cutover" com toggle por tenant + estado |
| Shadow mode / relatório de equivalência (S74) | Ferramenta de migração da Astrum | SuperAdminPage: tabela de `shadow_results` + taxa |
| Gates (readiness/go-live/final) | Processo interno | SuperAdminPage: checklist read-only |
| ETL/delta-sync | Operação Astrum | SuperAdminPage: última execução + contagens |
| Cifra ERP_CRED_KEY, HMAC secrets | Segurança | Nunca em UI (só env) |

### 2.3 TEM UI e confere ✅

CSAT, SLA (config e alertas), gamification/ranking, churn preditivo, personas de IA,
broadcast, templates HSM, filas/DLQ, CobrAI (regras, janela, limite/hora via AIConfigPage),
mapa de CTOs, estoque, equipe, OS/CRM técnico, webchat, WhatsApp (conexão), billing SaaS
(módulos `apps/frontend` vivos dentro do SettingsPage), super-admin básico.

### 2.4 UI que existe mas aponta para o MUNDO ERRADO

Esta é a não-conformidade mais séria (§3.1): as telas acima funcionam, mas leem/escrevem
**Firestore**, enquanto o motor v2 escreve **Supabase**. Até religar, cada tela mostra uma
verdade que o motor novo não vê (split-brain de leitura).

---

## 3. CONFORMIDADE DA CAMADA DE DADOS DO FRONTEND

### 3.1 Achado crítico — evidência de 2026-07-02

```
Páginas importando Firestore direto:      18 / 22
Páginas usando src/repositories/ (factory): 0 / 22   ← a abstração existe e está MORTA
Páginas usando supabase client:            1 (App.tsx, auth)
Chamadas a /api/v1 (Express legado):       2 arquivos
Chamadas a /api/v2 (Fastify novo):         1 arquivo
```

**Correção honesta ao registro da S78:** a sessão marcou o data-swap como pronto porque a
factory (`resolveDbProvider`) defaulta para Supabase — mas as páginas **não passam pela
factory**. O trabalho real da Fase 4 é: página a página, trocar `collection(db, ...)` por
`getXRepository()` (as implementações Supabase já existem para Customer, Ticket, Knowledge,
ServiceOrder, Tenant) ou por chamadas `/api/v2`. Estimativa: as 6 páginas de maior tráfego
primeiro (Dashboard, Customers, Tickets, Chat, ServiceOrders, CobrAI).

### 3.2 Regressão de MFA (introduzida pelo auth-swap S77)

`MfaLoginResolver.tsx` e `MfaRequirement.tsx` são Firebase (`getMultiFactorResolver`) e não
são mais alcançáveis pelo novo fluxo de login Supabase. **O produto perdeu 2FA.** Correção:
Supabase Auth suporta MFA TOTP nativo (`supabase.auth.mfa.enroll/challenge/verify`) — 1 sessão
de trabalho. Até lá, mitigação: senhas fortes forçadas + `must_reset_password` (já existe).

### 3.3 Rotas v2 prontas e não consumidas

26 rotas `/api/v2/*` no ar (auth, tickets, documents, rag, chat/stream, analytics, webhooks,
onboarding, billing/plan) e o frontend consome ~1. Os hooks prontos do `apps/web`
(`useChat` SSE, `useWebSocket`, React Query) seguem não-colhidos — a S78 física continua
pendente.

---

## 4. JORNADA DO DONO DE ISP — CONFORMIDADE PONTA A PONTA

Persona: **dono/gestor de um provedor** que administra tudo pela Astrum (SaaS).

| # | Estágio | O que existe | Gap | Nota |
|---|---|---|---|---|
| 1 | **Descobrir e assinar** (self-service signup, trial) | Rota `/api/v2/onboarding/register` + check-slug prontas; wizard lógico (S91) | **Sem página pública de signup/pricing/trial.** Entrada hoje é manual | 🔴 3/10 |
| 2 | **Onboarding** (6 etapas → WhatsApp conectado) | `onboarding.service` (6 etapas) + `evolutionInstanceName` + WhatsAppPage (conexão/QR) | Wizard visual não existe; etapas viram trabalho manual do suporte Astrum | 🟡 5/10 |
| 3 | **Conectar o ERP** (IXC/MK-Auth…) | Adapters S75 + cifra; SettingsPage tem campos soltos (HubSoft/Asaas) | Sem UI unificada "Conectar ERP" com teste de conexão; credenciais não passam pela tabela cifrada | 🟡 4/10 |
| 4 | **Configurar a IA** (persona, KB, guardrails, régua) | AIConfigPage (140 KB — rica: personas, escalação, CobrAI janela/limites) + KnowledgeBasePage | Falta simulador de conversa ("testar antes de ligar") e visibilidade de guardrails | 🟢 7/10 |
| 5 | **Operar o dia a dia** (tickets, chat, clientes, OS, equipe, estoque, mapa) | O ponto forte: 10+ páginas maduras (Chat 84 KB, Customers 65 KB, OS 79 KB, Team, Inventory, Map) | Dados vêm do Firestore (§3.1); InventoryPage tem 1 KB (esqueleto) | 🟢 8/10 |
| 6 | **Cobrar** (CobrAI, faturas, 2ª via) | CobrAIPage + BillingPage + guards + tools pix/boleto | Régua v2 ainda não é a ativa (flag legacy); sem tela de opt-out por cliente | 🟢 7/10 |
| 7 | **Medir e melhorar** (BI, custo, qualidade, benchmark) | BIPage, QualityMonitorPage, AIObservabilityPage, DashboardPage | **Sem custo de IA, sem RAGAS, sem benchmark, sem ANATEL** — as 4 coisas que justificam o preço do SaaS | 🔴 4/10 |
| 8 | **Administrar a assinatura** (plano, uso, upgrade, fatura da Astrum) | Módulos billing/subscriptions (`apps/frontend`) vivos no SettingsPage; quota lógica existe | Sem tela de consumo de mensagens/tokens vs. quota do plano; sem trial/upgrade self-service | 🟡 5/10 |
| 9 | **Segurança e compliance** (2FA, auditoria, LGPD) | Backend completo (audit_log, forget, RLS) | MFA regrediu; zero UI de auditoria/LGPD | 🔴 3/10 |

**Leitura da jornada:** a Astrum é forte exatamente no meio (operar/configurar/cobrar — estágios
4-6) e fraca nas pontas: **entrar sozinho** (1-3) e **provar valor + confiar** (7-9). Para um
SaaS, as pontas são o funil de venda e a retenção — é onde o investimento de UI rende mais.

---

## 5. FERRAMENTAS POR PAPEL (o dono tem o que precisa?)

| Papel | Tem hoje | Falta |
|---|---|---|
| **Dono do ISP** | Dashboard executivo, BI, financeiro, equipe, config IA | Custo IA, benchmark, ANATEL, consumo do plano, auditoria |
| **Atendente** | Chat completo, tickets, clientes, KB, webchat | Copilot de sugestão ao vivo (item 70 dossiê-105); visão do agente |
| **Técnico de campo** | TechnicianAppPage, OperatorMobilePage, OS, mapa | Telemetria/CTO saúde (S93 sem UI); modo offline |
| **Financeiro** | BillingPage, CobrAI | Opt-out por cliente, relatório de inadimplência exportável |
| **Astrum (super-admin)** | SuperAdminPage (10 KB, básico) | **Central de Operações**: engine flags, shadow, gates, ETL, health de todos os tenants — hoje TUDO isso é só env/SQL |

---

## 6. PLANO DE AÇÃO — SPRINT DE UI (S99–S110 propostas)

### P0 — Confiança e conformidade (fazem o SaaS ser vendável)
- **S99 — Conformidade de dados, parte 1:** Dashboard+Customers+Tickets → repositories/api-v2. *(mata §3.1 nas telas mais vistas)*
- **S100 — Conformidade de dados, parte 2:** Chat+ServiceOrders+CobrAI → v2; colher hooks do apps/web e deletá-lo (fecha S78 física).
- **S101 — MFA Supabase (TOTP):** repõe o 2FA perdido; remove componentes Firebase órfãos.
- **S102 — Página "Custos & IA":** custo por conversa/dia/tenant (Helicone/ai_token_logs) + orçamento com hard-stop (S97 já pronto no BE).
- **S103 — Central de Operações (SuperAdmin):** engine flags por tenant (canário S74), shadow report, gates, health de todos os ISPs.

### P1 — Completar o produto
- **S104 — Integrações ERP unificadas:** aba única com conectar/testar/status por provider, gravando em `tenant_erp_credentials` (cifrado).
- **S105 — Webhooks (Svix) UI:** endpoints, histórico de entregas, reenvio (rotas v2 já existem).
- **S106 — Observabilidade de IA completa:** RAGAS + guardrails bloqueados + LangSmith links na AIObservabilityPage.
- **S107 — Segurança & LGPD:** viewer de audit_log + botão "expurgar cliente" (S85) + export LGPD.
- **S108 — Benchmark + ANATEL no BI** (S96 já pronto no BE).
- **S109 — Signup público + wizard de onboarding** (S91 lógico → telas; trial 14 dias = item 19 dossiê-105).

### P2 — Novos mercados
- **S110+:** Portal do assinante (PWA separada), console de voz, war-room de crise, camada de telemetria no mapa, marketplace de integrações.

---

## 7. MÉTRICA-RESUMO DO DOSSIÊ

| Dimensão | Score | Comentário |
|---|---|---|
| Backend (12 blocos) | **9/10** | 748 testes; falta só operação em produção |
| Frontend — operação diária | **8/10** | Maduro e rico |
| Frontend — administração da plataforma | **4/10** | Custo/qualidade/saúde/compliance invisíveis |
| Conformidade FE↔BE (dados) | **2/10** | 18 páginas no banco errado; abstração morta |
| Jornada self-service (SaaS) | **3/10** | Sem signup, trial, consumo, upgrade |
| Segurança percebida | **5/10** | Base forte, mas MFA regrediu e auditoria sem UI |

**Prioridade nº 1 do produto:** S99–S101 (dados + MFA). Sem elas, o painel bonito mostra dados
do banco que está sendo desligado e sem 2FA. **Prioridade nº 1 do negócio:** S102 (custos de IA
visíveis) — é a primeira pergunta que todo dono de ISP fará antes de pagar a assinatura.

---
*Gerado por auditoria de código em 2026-07-02. Evidências: grep de rotas (23), páginas (22),
matriz de UI (28 capacidades verificadas), rotas v2 (26). Complementa
`docs/ASTRUM_ESTADO_FINAL_PLANO_V2.md` e o dossiê-105.*
