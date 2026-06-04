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

### DIA 43 — LangGraph: Fluxo de Suporte Técnico
**Sessão:** 43 de 58 | **Tipo:** IMPL
- [ ] Instalar @langchain/langgraph
- [ ] Criar packages/ai/src/agents/support-flow.graph.ts
- [ ] Implementar nós: classifyIssue → searchKnowledgeBase → generateSolution → escalate
- [ ] Regra: NENHUM agente avança sem validar o nó anterior
- [ ] Integrar com Qdrant (busca RAG) e Supabase (dados do cliente)
- [ ] Atualizar messageWorker.ts para usar o LangGraph em vez de lógica direta
- [ ] Criar visualizador de nó ativo no AstroChat (qual etapa o agente está)
- [ ] **TESTE:** Vitest — 100 execuções → nunca pula nó de validação

**Checklist Master:** Nenhum item direto (arquitetura de agentes)
**Blocos:** B04
**Frontend afetado:** AstroChat — indicador de etapa do agente

---

### DIA 44 — LangGraph: Fluxo CobrAI
**Sessão:** 44 de 58 | **Tipo:** IMPL
- [ ] Criar packages/ai/src/agents/cobrai-flow.graph.ts
- [ ] Implementar nós: sendWarning → negotiatePayment → suspendSignal → reactivateSignal
- [ ] Integrar com BullMQ: cada etapa é job com delay configurável por ISP
- [ ] Cancelamento de job se cliente pagar antes do próximo disparo
- [ ] Atualizar cobraiWorker.ts para usar o novo LangGraph
- [ ] Criar timeline visual da régua de cobrança no frontend
- [ ] **TESTE:** Vitest — fluxo completo de 5 etapas sem falha, com crash recovery

**Checklist Master:** Nenhum item direto
**Blocos:** B04
**Frontend afetado:** Módulo CobrAI — timeline da régua

---

### DIA 45 — LangGraph: Onboarding + Agentic RAG
**Sessão:** 45 de 58 | **Tipo:** IMPL
- [ ] Criar packages/ai/src/agents/onboarding-flow.graph.ts
- [ ] Implementar: Boas-vindas → Coleta de dados → Ativação → Configuração
- [ ] Implementar Agentic RAG: agente decide Supabase (dados) vs Qdrant (manuais)
- [ ] Log de cada decisão de roteamento RAG para otimização futura
- [ ] **TESTE:** Vitest — agente escolhe fonte correta em >90% dos cenários de teste

**Checklist Master:** Nenhum item direto
**Blocos:** B04

---

### DIA 46 — BullMQ Durable Workflows + HMAC nos Agentes
**Sessão:** 46 de 58 | **Tipo:** IMPL
- [ ] Implementar: "Vou pagar amanhã" → job com delay de 24h no BullMQ
- [ ] Implementar: "Ligue em 3 dias" → delay de 72h com cancelamento se pagar antes
- [ ] Validar HMAC em todos os webhooks que ativam agentes (pagamento, WhatsApp)
- [ ] Log de cada webhook recebido, validado e processado
- [ ] **TESTE:** Vitest — servidor reinicia durante delay de 24h → job executa no horário correto

**Checklist Master:** Nenhum item direto
**Blocos:** B04

---

### DIA 47 — Docker Multi-stage + GitHub Container Registry
**Sessão:** 47 de 58 | **Tipo:** SETUP
- [ ] Criar Dockerfile multi-stage para apps/api (imagem final <100MB)
- [ ] Criar Dockerfile multi-stage para apps/web
- [ ] Configurar GitHub Container Registry como registry privado
- [ ] Configurar health checks no container
- [ ] Criar docker-compose.yml para desenvolvimento local completo
- [ ] Garantir: nenhuma chave ou secret na imagem Docker
- [ ] **TESTE:** docker build → imagem <100MB, zero secrets incluídos

**Checklist Master:** `Dockerfile multi-stage testado localmente` → ✅
**Blocos:** B10

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
