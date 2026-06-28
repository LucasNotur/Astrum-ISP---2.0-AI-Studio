# ASTRUM AI ENGINE — CHECKLIST MASTER
> Rastreamento central de progresso da implementação dos 12 Blocos Tecnológicos
> Atualizado automaticamente pela IA ao final de cada sessão

---

## 📊 SCORECARD GERAL

| Sprint | Período | Blocos | Progresso | Gate |
|--------|---------|--------|-----------|------|
| Sprint 0 | Semanas 1–2 | B12 Padrões Arquiteturais | 14/14 dias | ✅ Aprovado |
| Sprint 1 | Semanas 3–4 | B07 Backend + B09 Segurança + B05 Dados | 14/14 dias | ✅ Aprovado |
| Sprint 2 | Semanas 5–6 | B06 Mensageria + B01 LLMs + B02 Guardrails + B03 RAG | 14/14 dias | ✅ Aprovado |
| Sprint 3 | Semanas 7–8 | B04 Agentes + B10 DevOps + B11 Observabilidade | 14/14 dias | ✅ Aprovado |
| Sprint 4 | Semanas 9–10 | B08 Frontend | 14/14 dias | ✅ Aprovado |
| Sprint 5 | Semanas 11–12 | Integração E2E | 14/14 dias | ✅ Aprovado |
| Sprint 6 | Semanas 13–14 | Escala Multi-tenant | 8/14 dias | 🔶 Em progresso |

**Progresso Total: 92 / 98 dias concluídos (Sessões 1–67 de ~96)**

---

## 🎯 NORTH STAR METRICS

| Métrica | Hoje | Meta | Status |
|---------|------|------|--------|
| Taxa de resolução autônoma | ~40% | >80% | ⬜ |
| Custo por conversa | R$X | R$X × 0.4 | ⬜ |
| Latência de resposta p95 | >3s | <1.5s | ⬜ |
| Cross-tenant data leak | Risco | Impossível (RLS) | ⬜ |
| Jobs perdidos em crash | Possível | 0 (Outbox+DLQ) | ⬜ |
| Visibilidade de custo por ISP | Nenhuma | Tempo real (Helicone) | ⬜ |
| Deploy com downtime | Sim | 0 (Graceful Shutdown) | ⬜ |
| Erros capturados antes do cliente | Raro | 100% (Sentry) | ⬜ |

---

## ✅ CHECKLIST TÉCNICO ZERO-FURO

### Infraestrutura & DevOps
- [x] Monorepo TurboRepo: apps/web + apps/api + packages/*
- [x] Dockerfile multi-stage testado localmente
- [x] GitHub Actions: lint → vitest → playwright → build → deploy
- [ ] Ephemeral environments por PR
- [ ] Pulumi IaC: toda infraestrutura em código TypeScript
- [x] Graceful Shutdown: SIGTERM handler no Node.js
### Backend & Endpoints
- [x] Zod em todas as rotas críticas
- [x] Zero Express no código (100% Fastify)
- [x] Tenant Onboarding automatizado (6 etapas)
- [x] Multi-Tenant Billing com limites por plano

### Banco de Dados & Storage
- [x] RLS em TODAS as tabelas desde a primeira migration
- [x] Supabase Realtime (CDC) nas tabelas críticas
- [x] Cloudflare R2 para storage de documentos
- [x] Outbox table criada (id, payload, sent_at, attempts)
- [x] Idempotency keys table criada
- [x] WAL ativo e testado com crash recovery
- [x] DuckDB para analytics OLAP
- [x] ETL Supabase → DuckDB incremental

### IA & RAG
- [x] Helicone mostrando custo por ISP em tempo real
- [x] LLM Router: GPT-4o-mini para chat, GPT-4o para raciocínio
- [x] Prompt Caching ativo em system instructions longas
- [x] OpenAI Batch API (50% desconto)
- [x] Zod schemas em TODOS os outputs da IA
- [x] PII anonimizado antes da OpenAI (CPF, CC → [DADO_SENSIVEL])
- [x] Injection Deflector com score acumulativo
- [x] Content Moderation + Pipeline Guardrails completo
- [x] LangSmith tracing sempre ativo (staging + prod)
- [x] Qdrant Vector DB configurado (particionamento por tenant_id)
- [x] Embedding Service + Document Chunking
- [x] RAG Query Engine com Qdrant
- [x] System Prompt Builder por tenant
- [x] Streaming SSE de respostas LLM
- [x] Context Window (Sliding Window Compress)
- [x] Fluxo end-to-end de atendimento (RAG + Salvar + Enviar)
- [ ] Pipeline de ingestão PDF testado (200 páginas sem erros)
- [x] Hybrid Search (BM25 + Semântico) com score fusion
- [x] HyDE para queries vagas implementado
- [x] Zep/Mem0 para memória de longo prazo
- [ ] RAGAS score ≥ 0.75 no test set
- [x] CobrAI Scheduler + Worker
- [x] LangGraph state machines para todos os fluxos + Agentic RAG
- [x] R2 + Outbox + Filas Prioritárias
- [x] WebSockets Bidirecionais

### Segurança
- [x] CI job: grep no repositório = zero API keys
- [x] JWT rotation: 15 minutos no Supabase Auth
- [x] RBAC: Técnico / Gestor / Admin testados via E2E
- [x] Supabase Auth + RBAC implementado
- [x] HMAC em todos os webhooks (WhatsApp, pagamentos, ISP)
- [x] Circuit Breaker em OpenAI, WhatsApp, pagamentos
- [x] Rate Limiting (Token Bucket) em todas as rotas públicas
- [x] Argon2id para todas as senhas de usuários
- [ ] VPC: Supabase + Redis sem acesso público direto

### Frontend & UI
- [x] Frontend Auth migrado para JWT próprio
- [x] React Query + Supabase Realtime no frontend
- [x] Chat UI com Streaming SSE
- [x] Dashboard Analytics Frontend
- [x] Document Upload UI + CobrAI Admin UI

### Qualidade & Observabilidade
- [x] Sentry em staging E produção com source maps
- [x] Pino.js: zero console.log no código de produção
- [x] Playwright E2E Setup configurado
- [x] E2E Tests: Chat + Knowledge + API + CobrAI
- [ ] Lighthouse CI: Performance >85, Accessibility >90
- [ ] LLM-as-a-Judge automatizado em cada deploy de prompts
- [ ] Synthetic monitoring rodando 24/7
- [x] Frontend + Performance → GATE APROVADO

---

## 🗺️ MAPA DE DEPENDÊNCIAS (ordem de execução obrigatória)

```
[B12 Padrões] ← BASE. Implementar ANTES de qualquer código.
      ↓
[B07 Backend] ← Motor central. Tudo depende disso.
      ↓
[B09 Segurança] ← Auth + RLS. Sem isso, sem multi-tenant.
      ↓
[B05 Dados] ← Supabase + Qdrant + R2. Memória do sistema.
      ↓
[B06 Mensageria] ← Redis + BullMQ. Sistema circulatório.
      ↓
[B01 LLMs] ← OpenAI + Routing. O cérebro.
      ↓
[B02 Guardrails] ← Zod + Presidio. Blindagem cognitiva.
      ↓
[B03 RAG] ← Qdrant + Zep + HyDE. Memória de longo prazo.
      ↓
[B04 Agentes] ← LangGraph + BullMQ. Sistema nervoso.
      ↓
[B08 Frontend] ← React + Zustand + WebSockets. Interface.
      ↓
[B10 DevOps] ← Docker + CI/CD. Fábrica de deploys.
      ↓
[B11 Observabilidade] ← Sentry + LangSmith + RAGAS. Os olhos.
```

---

*Criado em: 2026-05-31 | Versão 1.0*
*Atualizado automaticamente pela IA ao final de cada sessão de implementação*
