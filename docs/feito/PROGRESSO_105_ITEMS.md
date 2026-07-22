# PROGRESSO DOS 105 ITENS SAAS

**Data de Início:** 2026-05-20
**Última Atualização:** 2026-07-22 (batch pós-GA: #27, #47, #83, #97, #98, #102)
**Objetivo:** Rastrear a implementação do "DOSSIÊ RATIO: ASTRUM (AS-IS) VS SAAS ALVO (TO-BE)" garantindo que todos os 105 gaps listados sejam implementados.

---

## A. Automação de Onboarding B2B & Core Multi-Tenant (1-15)
- [x] 1. Self-Service Sign Up — SignupPage.tsx + trial.service.ts + register.route.ts
- [x] 2. Onboarding Guiado — wizard.ts (6 etapas) + OnboardingWizardPage.tsx + OnboardingTour.tsx
- [x] 3. Isolamento RLS/Database — 80+ migrations com RLS + rls-isolation.test.ts (90 combinações)
- [x] 4. Isolamento de Credenciais Nativas (Vaults) — credential-cipher.ts (AES-256-GCM)
- [x] 5. Seed Automático do Tenant — seed-demo-tenant.ts + 001_dev_seed.sql + e2e-seed.sql
- [x] 6. SuperAdmin Central — SuperAdminPage.tsx + RBAC super_admin role
- [~] 7. Lifecycle Account Management — upgrade/deactivate exist; suspend/ban/archive pendente
- [~] 8. Sub-domínios Dinâmicos — URL param discovery funcional; subdomain DNS pendente
- [x] 9. Gerenciador Multi-Filial — branch-manager.service.ts (árvore hierárquica, descendants, path, permissão por manager)
- [x] 10. Automação Evolution API — evolution-provision.service.ts + auto-provisioning
- [x] 11. White Label Nativo — PortalPage.tsx (PWA subscriber) + feature flag enterprise
- [ ] 12. Configuração Organizacional Hierarquizada
- [x] 13. Plataforma de Billing Nativa
- [x] 14. Billing via Pix Direto pro SaaS
- [~] 15. Gestão Role e Mapeamento LDAP — RBAC completo (rbac.middleware.ts); LDAP não implementado

## B. Gestão Comercial (Modelo de Planos) (16-30)
- [~] 16. Controle de Quotas de Mensagens — usage-sync.worker.ts (tracking/alerting); hard enforcement pendente
- [x] 17. Controle de Token Limit per Mensagem — tokenLimit em config + system-prompt-builder
- [x] 18. Gestão por Seats — seat-management.service.ts (alocação, extra seats com custo, addOperator)
- [x] 19. Módulo "Plano Trial de 14 Dias" — trial.service.ts (14 dias, radar_trial)
- [x] 20. Módulo de Add-Ons — addon-module.service.ts (compatibilidade plano, feature flags, ativação)
- [x] 21. Prevenção de Fraude em Chargeback — chargeback-prevention.service.ts (risk assessment, auto-block, warning)
- [x] 22. Relatórios de Gasto Individualizado B2B — tenant-usage-report.service.ts (mensagens/tokens/storage/overage/plano)
- [x] 23. Emissão de Notas Fiscais — invoice-nf.service.ts (NF-e/NFS-e, SEFAZ submit, cancelamento, CPF/CNPJ validation)
- [ ] 24. Gestões de Acordo "Sob Demanda"
- [ ] 25. Módulo Afiliados
- [x] 26. Tela de Consumo de Orçamento de Agentes — agent-budget.service.ts (tokens/custo por agente, overBudget alert)
- [x] 27. Bloqueador Global (Inadimplência) — delinquency-blocker.service.ts (threshold configurável, grace period, notificação pré-bloqueio)
- [ ] 28. Cartão em arquivo (Gateway)
- [x] 29. Feature Flags baseadas no tier do plano — flagsForTier() starter/pro/enterprise + overrides
- [x] 30. Previsibilidade financeira Dashboard — cashflow-forecast.service.ts (3 cenários 90 dias)

## C. Integrações Nativas "ISPs", ERPs e Add-on Ecosystem (31-50)
- [x] 31. IXC Provider Integração — ixc.adapter.ts
- [x] 32. MK-Auth Integração — mkauth.adapter.ts + test
- [x] 33. SGP Integração — sgp.adapter.ts + test
- [x] 34. Voalle Integração — voalle.adapter.ts + test
- [x] 35. HubSoft Integração — hubsoft.adapter.ts + test
- [x] 36. ReceitaBox Integração — rbx.adapter.ts + test
- [ ] 37. TopSapp Integração
- [x] 38. Gestão Autônoma de Webhooks ERP — webhook-config.routes.ts + Svix + WebhooksPage.tsx
- [x] 39. Sincronização em Massa de Cadastros — erp-sync.worker.ts
- [~] 40. Integração Bidirecional (Astrum <-> ERP) — write-back (suspend/OS) existe; sync genérico pendente
- [ ] 41. Marketplace "One Click App"
- [ ] 42. Roteamento PPOE Automático
- [ ] 43. Consulta de Radius Ativo
- [x] 44. Painel Mapas (Monitoria do CTO) — MapPage.tsx + network-graph.service.ts
- [x] 45. Abertura de Chamado direto pela API no ERP — createServiceOrder em erp.types.ts + tools.executor.ts
- [ ] 46. Inteção Zapier / n8n / Make apps
- [x] 47. Exportador de banco nativo JSON/CSV — data-export.service.ts (JSON/CSV, tenant-scoped, limit configurável)
- [x] 48. Disparo via SMTP de notas do SAAS — smtp-invoice-sender.service.ts (template HTML, retry, rate limit)
- [ ] 49. Importe de dados retroativos de CRM terceiros
- [ ] 50. Rotação Dinamica de IPs

## D. Omnichannel & CRM de Chats (51-65)
- [x] 51. Round Robin Inteligente — roundRobin.test.ts + operator assignment
- [x] 52. Enfileiramento em cascata — cascade-queue.service.ts (multi-grupo, timeout, fallback IA/voicemail)
- [x] 53. Disparo ativo API Oficial (HSM, Templates META) — hsm-template.service.ts (extract/render variables, validação META, envio proativo)
- [ ] 54. Suporte a Facebook Messenger
- [ ] 55. Suporte a IG Direct
- [x] 56. Web Widget Customizável — web-widget.service.ts (config visual, script embed, rate limit, sanitize)
- [x] 57. Email to Ticket — email-to-ticket.service.ts (resolve tenant por domínio, thread reply, aliases suporte)
- [ ] 58. Múltiplas Conexões/Zaps na mesma interface
- [x] 59. Agrupamento de Conversas Cross-Line (Entidade Unificada) — cross-line-grouping.service.ts (unifiedContact, merge, dedup)
- [x] 60. Editor Visual de Kanban de Pipelines — kanban-pipeline.service.ts (colunas, WIP limit, drag-and-drop, stats)
- [x] 61. Chat Interno NATIVO P2P — internal-chat.service.ts (DM/grupo, unread count, access control)
- [x] 62. Módulo de tags Hierárquicas e Macro — tag-hierarchy.service.ts (árvore, subtree, ancestors, macros)
- [x] 63. Módulo "Observadores/Espionagem" — conversation-spy.service.ts (observe/whisper/takeover, permissões RBAC)
- [x] 64. Pesquisa Full-Text Robusta — hybrid-search.service.ts (RAG + Qdrant + reranking)
- [x] 65. Filtros Atuais (Complexos) — filter-engine.service.ts (AND/OR, 12 operadores, nested groups, toSqlWhere)

## E. AI Ops, IA Copilot e Configurações Cognitivas (66-80)
- [x] 66. Model Training Dashboard "Feedback Loop" — feedback-loop.service.ts (good/bad/edited, training pairs, stats)
- [x] 67. Tela de "Simulação" (Testador Chatie no Admin) — chat-simulator.service.ts (multi-turn, tokens/latency tracking)
- [x] 68. Módulo RAG Multimodal (PDFs) — documents.routes.ts + Qdrant + hybrid-search
- [x] 69. Classificador Churn Preditivo AI — churn.routes.ts + churn.worker.ts + ChurnPage.tsx
- [x] 70. AI Suggestion ao Vivo "Copilot" — field-copilot.service.ts + routes + TechnicianAppPage.tsx
- [x] 71. Transcript de Áudio no chat — voice-qa.service.ts + VoiceQaPage.tsx
- [x] 72. AI Summaries do Agent Hand-off — handover-summary.service.ts + escalate.node.ts
- [ ] 73. Mapeador Gráfico de Workflow de Agentes de Prompt (Node-Based)
- [x] 74. Fallback Dinâmico Automativo de Provider — provider-fallback.service.ts (circuit breaker)
- [x] 75. Regresso automático IA-Agent — agent-regression.service.ts (max turnos, sentimento, loop detection, escalação)
- [x] 76. Definição do Personality Type (Adjustável por Drag sliders) — comm-style.ts (formal/coloquial/tecnico)
- [x] 77. Agendamento Multi-Parametro e cruzamento de técnicos — scheduling.service.ts (skills, região, disponibilidade, load balancing)
- [x] 78. Análise Fotográfica IA (Ler LEDs roteador) — vision.service.ts + vision.routes.ts
- [x] 79. Automação IA de "Auditoria Noturna" — nightly-brain/ (service + actions + report)
- [x] 80. Controle Rígido do Hallucination Parameters — safety-classifier.service.ts + constitution.service.ts + guardrails.node.ts

## F. Analytics, Broadcast e Retenção (81-90)
- [x] 81. Disparador Massivo Broadcast CRM WhatsApp — broadcast-whatsapp.service.ts (HSM template, opt-out, delivery tracking)
- [x] 82. Régua de Cobrança Integrada — cobrai.worker.ts + bandit.ts + negotiation-policy
- [x] 83. NPS e CSAT Reporting Avançado — nps-csat.service.ts (NPS+CSAT, breakdown por canal/operador, trend mensal)
- [x] 84. SLAs Customizáveis — sla-eval.ts + sla.worker.ts
- [x] 85. Painel de Analytics Global KPI, MAU, TMA — DashboardPage + BIPage + ValorGeradoPage
- [x] 86. Conversões Dashboard funil — conversion-funnel.service.ts (lead→trial→active→upgrade→churn, trend mensal)
- [x] 87. Follow-Up Lead Management Automático via IA — lead-followup.service.ts (classify, stale detection, LLM message gen)
- [x] 88. Campanha Broadcast Retencional — broadcast-retention.service.ts (segmento churn, personalização, throttle)
- [x] 89. API de Relatórios Analíticos DataLake — duckdb.service.ts + etl.service.ts + etl.routes.ts
- [x] 90. Exportação programável Automática — scheduled-export.service.ts (daily/weekly/monthly, email/webhook delivery)

## G. Operações Externas Field Service / Técnico NOC (91-95)
- [ ] 91. Mapeamento Geo-Location App Field Técnicos
- [x] 92. Função Uber/Rastreio (Link Tracker para o Cliente) — PortalPage.tsx service-orders
- [x] 93. Bater Foto de Roteador do app técnico com sync — vision.service.ts + field-copilot
- [x] 94. Mapeamento de Macro Crise e Encerramento Massivo — crisis-detector.ts + crisis.worker.ts
- [ ] 95. Gerenciamento de Kits / Almoxarifado Integrado Básico

## H. Governança, Monitoramento SLA, Segurança e LGPD (96-105)
- [x] 96. Compliance Termo Adesão de LGPD da IA — compliance.routes.ts (DPA, due diligence)
- [x] 97. Máscara RegEX Rigida de Criptografia At Rest — pii-masking.service.ts (CPF/CNPJ/email/tel/cartão, detect+mask)
- [x] 98. Retenção Politica Data-Flush Custom — data-retention.service.ts (política por tenant, default 365d conversas/5y fiscal)
- [x] 99. Right to be Forgotten UI Workflow — planCustomerForget (8 camadas) + zep memory delete
- [x] 100. Auditoria de Log Level Avançada Pessoal — audit.ts + ai-audit.service.ts (hash-chain)
- [x] 101. 2FA ou Biometria Nativo para Operadores — TOTP MFA via Supabase Auth (SettingsPage)
- [x] 102. IP Whitelisting de painel Admin — ip-whitelist.service.ts (CIDR matching, per-tenant, checkAccess)
- [ ] 103. Múltiplos Tokens Sessão App Nativo (Push)
- [ ] 104. Single Sign ON (SAML/OIDC/Google)
- [ ] 105. Layer Avançada Shield/Firewall WAF AntiDDoS

---

## Resumo (2026-07-22)

| Grupo | Total | Implementados | Parciais | Pendentes |
|-------|-------|---------------|----------|-----------|
| A. Onboarding/Multi-tenant | 15 | 11 | 3 | 1 |
| B. Comercial | 15 | 11 | 1 | 3 |
| C. Integrações | 20 | 11 | 1 | 8 |
| D. Omnichannel | 15 | 13 | 0 | 2 |
| E. AI Ops | 15 | 14 | 0 | 1 |
| F. Analytics | 10 | 10 | 0 | 0 |
| G. Field Service | 5 | 3 | 0 | 2 |
| H. Governança | 10 | 7 | 0 | 3 |
| **TOTAL** | **105** | **79** | **5** | **21** |

**Notas sobre o Status:** [x] = implementado com código + testes; [~] = parcial (funcionalidade core existe, falta completude); [ ] = pendente (backlog pós-GA).
