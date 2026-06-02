# SPRINT 3 — AGENTES + DEVOPS + OBSERVABILIDADE
**Blocos:** B04 Agentes · B10 DevOps · B11 Observabilidade
**Duração:** 2 semanas (14 dias)
**Objetivo:** IA começa a agir de forma autônoma. Fábrica de deploys. Visibilidade total.
**Status:** ⬜ Não iniciado | 🔒 Bloqueado até Gate Sprint 2

---

## GATE DE ENTRADA
- [ ] Gate Sprint 2 aprovado (todos os 13 critérios ✅)

---

## SEMANA 7

### DIA 41 — CobrAI Rules Engine
**Sessão:** 41 de 58 | **Tipo:** IMPL
- [x] Criar apps/api/src/domain/cobranca/cobrai-rules.service.ts
- [x] Criar testes unitários para o Rules Engine
- [x] Criar migration para regras padrão
- [x] **TESTE:** 6/6 passando

**Checklist Master:** `CobrAI Rules Engine` → ✅
**Blocos:** B04

---

### DIA 42 — CobrAI Worker + Scheduler
**Sessão:** 42 de 58 | **Tipo:** IMPL
- [x] Criar apps/api/src/domain/cobranca/cobrai.scheduler.ts
- [x] Criar packages/queue/src/workers/cobrai.worker.ts
- [x] Integrar Scheduler e cancelamento no listener de Realtime
- [x] **TESTE:** 2/2 passando

**Checklist Master:** `CobrAI Scheduler + Worker` → ✅
**Blocos:** B04

---

### DIA 43 — LangSmith Tracing
**Sessão:** 43 de 58 | **Tipo:** IMPL
- [x] Instalar dependência langsmith
- [x] Criar apps/api/src/infrastructure/observability/langsmith.service.ts
- [x] Integrar LangSmith no RAG Query Engine
- [x] Criar rota de feedback do operador
- [x] Atualizar .env.example
- [x] **TESTE:** 4/4 passando

**Checklist Master:** `LangSmith tracing sempre ativo (staging + prod)` → ✅
**Blocos:** B11


---

### DIA 44 — Sentry Error Monitoring
**Sessão:** 44 de 58 | **Tipo:** IMPL
- [x] Instalar @sentry/node @sentry/profiling-node
- [x] Criar apps/api/src/infrastructure/observability/sentry.service.ts
- [x] Criar plugin Fastify para Sentry com error handler
- [x] Integrar Sentry nos workers BullMQ
- [x] Rota de health check exibe status do Sentry
- [x] **TESTE:** 4/4 passando

**Checklist Master:** `Sentry em staging E produção com source maps` → ✅
**Blocos:** B11

---

### DIA 45 — ETL Supabase → DuckDB
**Sessão:** 45 de 58 | **Tipo:** IMPL
- [x] Criar apps/api/src/infrastructure/analytics/etl.service.ts
- [x] Criar packages/queue/src/workers/etl.worker.ts
- [x] Agendar execução recorrente a cada 15min
- [x] Criar endpoint manual em etl.routes.ts
- [x] **TESTE:** 2/2 passando

**Checklist Master:** `ETL Supabase → DuckDB incremental` → ✅
**Blocos:** B12

---

### DIA 46 — Tenant Onboarding Flow
**Sessão:** 46 de 58 | **Tipo:** IMPL
- [x] Criar apps/api/src/domain/onboarding/onboarding.service.ts
- [x] Criar apps/api/src/domain/onboarding/onboarding.routes.ts
- [x] Criar apps/api/src/domain/onboarding/onboarding.service.test.ts
- [x] Registrar rota no servidor
- [x] **TESTE:** 3/3 passando

**Checklist Master:** `Tenant Onboarding automatizado (6 etapas)` → ✅
**Blocos:** B04

---

### DIA 47 — Multi-Tenant SaaS Billing + Revisão Final
**Sessão:** 47 de 58 | **Tipo:** IMPL
- [x] Criar apps/api/src/domain/onboarding/plan-limits.service.ts
- [x] Aplicar limite de plano nas rotas críticas
- [x] Criar testes unitários para limites de plano
- [x] Criar rota de informações do plano
- [x] Executar suite completa do Sprint 3
- [x] **TESTE:** 26/26 passando

**Checklist Master:** `Multi-Tenant Billing com limites por plano` → ✅
**Blocos:** B04

---

### DIA 48 — GitHub Actions Pipeline CI/CD
**Sessão:** 48 de 58 | **Tipo:** SETUP
- [ ] Criar .github/workflows/ci.yml: Lint → Vitest → Playwright → Build → Deploy
- [ ] Configurar TurboRepo Remote Caching no pipeline
- [ ] Adicionar job de secret scanning (grep por API keys)
- [ ] Proteção: deploy para produção somente após todos os tests passarem
- [ ] **TESTE:** Push de PR → pipeline executa e falha corretamente se teste quebrar

**Checklist Master:** `GitHub Actions: lint → vitest → playwright → build → deploy` → ✅
**Blocos:** B10

---

### DIA 49 — Ephemeral Environments + PaaS Deploy
**Sessão:** 49 de 58 | **Tipo:** SETUP
- [ ] Configurar Render/DigitalOcean App Platform (ou Fly.io)
- [ ] Implementar Ephemeral Environments: cada PR abre preview isolado
- [ ] Configurar Graceful Shutdown no PaaS
- [ ] Zero-downtime deploy com Health Probe antes de trocar container
- [ ] Testar: git push → deploy automático em <5 minutos
- [ ] **TESTE:** Playwright — abrir preview de PR, executar fluxo básico de chat

**Checklist Master:** `Ephemeral environments por PR`, `Graceful Shutdown implementado` → ✅
**Blocos:** B10

---

## SEMANA 8

### DIA 50 — Pulumi IaC + Renovate
**Sessão:** 50 de 58 | **Tipo:** SETUP
- [ ] Instalar Pulumi CLI
- [ ] Criar infra/index.ts declarando toda a infraestrutura em TypeScript
- [ ] Declarar: Supabase, Redis, R2 buckets, Qdrant
- [ ] Configurar Renovate: PRs automáticos para atualização de dependências
- [ ] Configurar alertas de segurança (Dependabot) integrados ao Slack
- [ ] **TESTE:** pulumi preview → mostra infraestrutura esperada sem erros

**Checklist Master:** `Pulumi IaC: toda infraestrutura em código TypeScript` → ✅
**Blocos:** B10

---

### DIA 51 — Sentry Error Tracking
**Sessão:** 51 de 58 | **Tipo:** SETUP + IMPL
- [ ] Configurar Sentry em staging E produção com Source Maps do TypeScript
- [ ] Ativar Sentry Profiling: identificar funções que consomem mais CPU
- [ ] Configurar alertas para Slack em erros novos ou spike de erros existentes
- [ ] Configurar Performance Monitoring: rastrear endpoints lentos
- [ ] Criar widget de saúde do sistema no dashboard admin
- [ ] **TESTE:** Provocar erro em produção → alerta chega em <2 minutos

**Checklist Master:** `Sentry em staging E produção com source maps` → ✅
**Blocos:** B11
**Frontend afetado:** Dashboard admin — widget de saúde do sistema

---

### DIA 52 — LangSmith Tracing
**Sessão:** 52 de 58 | **Tipo:** SETUP + IMPL
- [ ] Criar projeto LangSmith
- [ ] Configurar LANGCHAIN_TRACING=true em staging e produção
- [ ] Garantir que TODA chamada à OpenAI tem trace visível no LangSmith
- [ ] Configurar tags por tenant_id para rastrear custo por ISP
- [ ] **TESTE:** Vitest — chamada à OpenAI → trace aparece no LangSmith em <5s

**Checklist Master:** `LangSmith tracing sempre ativo` → ✅
**Blocos:** B11

---

### DIA 53 — RAGAS Avaliação do RAG
**Sessão:** 53 de 58 | **Tipo:** IMPL
- [ ] Criar test set de 50 queries técnicas reais de ISP com respostas esperadas
- [ ] Configurar RAGAS rodando diariamente no CI
- [ ] Métricas: faithfulness, answer_relevancy, context_precision
- [ ] Criar relatório automático de qualidade RAG no painel admin
- [ ] **TESTE:** RAGAS score ≥ 0.75 no test set de suporte técnico

**Checklist Master:** `RAGAS score ≥ 0.75 no test set` → ✅
**Blocos:** B11
**Frontend afetado:** Dashboard admin — card de qualidade RAG

---

### DIA 54 — LLM-as-a-Judge
**Sessão:** 54 de 58 | **Tipo:** IMPL
- [ ] Criar packages/ai/src/evals/llm-judge.service.ts
- [ ] Criar test set de 100 perguntas difíceis de suporte ISP
- [ ] Implementar avaliação automática: GPT-4o avalia nova versão vs anterior
- [ ] Configurar no CI: deploy cancelado se nota cair >10% vs versão anterior
- [ ] **TESTE:** Simular prompt piorado → CI cancela deploy automaticamente

**Checklist Master:** `LLM-as-a-Judge automatizado em cada deploy de prompts` → ✅
**Blocos:** B11

---

### DIA 55 — Vitest + Playwright + Lighthouse CI
**Sessão:** 55 de 58 | **Tipo:** IMPL
- [ ] Criar testes Vitest para toda a lógica de domínio (use cases, adapters)
- [ ] Criar testes Playwright: login → emitir fatura → chat IA → resolver ticket
- [ ] Configurar Lighthouse CI: Performance >85, Accessibility >90
- [ ] Configurar: PR rejeitado se Lighthouse score cair
- [ ] **TESTE:** Suite Playwright completa verde em ambiente de staging

**Checklist Master:** `Playwright E2E: login → fatura → chat → ticket`, `Lighthouse CI` → ✅
**Blocos:** B11

---

### DIA 56 — GATE SPRINT 3 (Definition of Done)
**Sessão:** 56 de 58 | **Tipo:** GATE
- [ ] ✅ LangGraph: nunca pula nó de validação em 100 execuções
- [ ] ✅ CobrAI: régua completa de 5 etapas funcionando end-to-end
- [ ] ✅ BullMQ delay 24h: testado com crash e recuperado no horário correto
- [ ] ✅ Docker: imagem <100MB sem secrets
- [ ] ✅ GitHub Actions: deploy em <5 minutos
- [ ] ✅ Ephemeral environments: PR abre preview em <3 minutos
- [ ] ✅ TurboRepo: segundo build sem mudanças em <30 segundos
- [ ] ✅ Sentry: erro em produção → alerta em <2 minutos
- [ ] ✅ LangSmith: 100% das chamadas LLM rastreadas
- [ ] ✅ RAGAS: score ≥ 0.75
- [ ] ✅ LLM-as-a-Judge: bloqueou 1 deploy de regressão nos testes
- [ ] ✅ Playwright: suite completa verde

**GATE STATUS:** ⬜ Pendente

---

## RESUMO DO SPRINT 3

| Item | Status |
|------|--------|
| Dias concluídos | 0 / 14 |
| Sessões executadas | 0 / 14 |
| Testes Vitest criados | 0 |
| Testes Playwright criados | 0 |
| Gate | ⬜ Pendente |
| Próximo sprint | Sprint 4 — Frontend Production-Grade |

---

*Sprint 3 criado em: 2026-05-31 | Atualizado automaticamente pela IA*
