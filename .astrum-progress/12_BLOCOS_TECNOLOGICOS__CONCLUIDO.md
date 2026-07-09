# ASTRUM AI ENGINE — 12 BLOCOS TECNOLÓGICOS

> Mapa completo das tecnologias implementadas por bloco.
> Cada bloco foi planejado e executado em sessões específicas dos 7 Sprints.

---

## B01 — LLMs & FinOps
**Sprint:** 2, 6 | **Objetivo:** Cérebro da IA com controle de custo

| Tecnologia | Função | Status |
|-----------|--------|--------|
| OpenAI GPT-4o / GPT-4o-mini | LLM principal (routing por complexidade) | ✅ |
| Vercel AI SDK | Function Calling + Structured Outputs (Zod) | ✅ |
| Helicone | Proxy FinOps — custo por tenant em tempo real | ✅ |
| OpenAI Batch API | Jobs em lote com 50% desconto (churn, classificação) | ✅ |
| Prompt Caching (Redis) | Cache de system prompts TTL 24h | ✅ |
| Few-Shot Dinâmico (Qdrant) | Exemplos similares injetados automaticamente | ✅ |
| LLM Router | GPT-4o-mini para chat simples, GPT-4o para raciocínio | ✅ |

**Arquivos-chave:** `vercel-ai.service.ts`, `tools.executor.ts`, `batch.service.ts`, `prompt-cache.service.ts`, `few-shot.service.ts`, `llm.adapter.ts`

---

## B02 — Guardrails & Segurança de IA
**Sprint:** 2 | **Objetivo:** Blindagem cognitiva LGPD-compliant

| Tecnologia | Função | Status |
|-----------|--------|--------|
| PII Detector (Regex BR) | Mascara CPF, RG, cartão, telefone, pix antes do LLM | ✅ |
| Injection Deflector | Score acumulativo anti-jailbreak (DAN, ignore instructions) | ✅ |
| Content Moderation | OpenAI Moderation API com fail-open | ✅ |
| Guardrails Pipeline | Pipeline 3 camadas: PII → Injection → Moderation | ✅ |
| Zod Structured Outputs | Zero JSON parse manual — schemas tipados | ✅ |

**Arquivos-chave:** `pii-detector.service.ts`, `injection-deflector.service.ts`, `content-moderation.service.ts`, `guardrails.pipeline.ts`

---

## B03 — RAG & Memória de Longo Prazo
**Sprint:** 2, 6 | **Objetivo:** Memória inteligente por tenant

| Tecnologia | Função | Status |
|-----------|--------|--------|
| Qdrant Vector DB | Armazenamento de embeddings por tenant (coleções isoladas) | ✅ |
| OpenAI Embeddings (text-embedding-3-small) | 1536 dims, threshold 0.72 | ✅ |
| Document Chunker | Sliding window + overlap 200 chars | ✅ |
| RAG Query Engine | Busca semântica + injeção de contexto no LLM | ✅ |
| Hybrid Search (BM25 + Semântico) | Reciprocal Rank Fusion (0.7 dense + 0.3 sparse) | ✅ |
| HyDE | Hypothetical Document Embeddings para queries vagas | ✅ |
| Zep/Mem0 | Memória de longo prazo (3 camadas, fail-open) | ✅ |
| System Prompt Builder | Prompt dinâmico por tenant com contexto RAG | ✅ |
| Context Window Manager | Sliding window 20 msgs + compressão de histórico | ✅ |

**Arquivos-chave:** `qdrant.adapter.ts`, `embedding.service.ts`, `document-chunker.service.ts`, `rag-query.service.ts`, `hybrid-search.service.ts`, `zep.service.ts`, `memory-composer.service.ts`, `system-prompt-builder.service.ts`, `context-window.service.ts`

---

## B04 — Agentes Autônomos
**Sprint:** 3, 6 | **Objetivo:** IA que age, não apenas responde

| Tecnologia | Função | Status |
|-----------|--------|--------|
| LangGraph | State Machine com 8 nós e edges condicionais | ✅ |
| Agentic RAG | Nó decide_source para routing inteligente de contexto | ✅ |
| CobrAI Rules Engine | Régua de cobrança automatizada (4 ações) | ✅ |
| CobrAI Scheduler + Worker | Jobs BullMQ para disparos automáticos | ✅ |
| Conversation Service | Fluxo E2E: Guardrails → RAG → LLM → Salvar → Enviar | ✅ |
| WhatsApp Message Sender | Integração Evolution API | ✅ |

**Arquivos-chave:** `agent.state.ts`, `agent.nodes.ts`, `langgraph.service.ts`, `cobrai-rules.service.ts`, `cobrai.scheduler.ts`, `conversation.service.ts`, `message-sender.service.ts`

---

## B05 — Dados & Storage
**Sprint:** 1 | **Objetivo:** Memória persistente multi-tenant

| Tecnologia | Função | Status |
|-----------|--------|--------|
| Supabase (PostgreSQL) | Banco principal com RLS por tenant | ✅ |
| Supabase Realtime (CDC) | Change Data Capture em tabelas críticas | ✅ |
| Cloudflare R2 | Storage S3-compatible (zero egress fees) | ✅ |
| DuckDB | Analytics OLAP in-process | ✅ |
| ETL Service | Supabase → DuckDB incremental a cada 15min | ✅ |

**Arquivos-chave:** `tenant-db.service.ts`, `realtime.service.ts`, `r2.adapter.ts`, `duckdb.service.ts`, `etl.service.ts`

---

## B06 — Mensageria & Filas
**Sprint:** 1, 6 | **Objetivo:** Sistema circulatório (zero mensagens perdidas)

| Tecnologia | Função | Status |
|-----------|--------|--------|
| Redis (ioredis) | Cache, pub/sub, rate limiting | ✅ |
| BullMQ | Filas por domínio (messages, cobranca, indexing, etl, batch) | ✅ |
| Outbox Pattern | Consistência transacional (publish + processPending) | ✅ |
| Filas Prioritárias | critical=10, normal=5, batch=1 | ✅ |
| WebSockets (Redis Pub/Sub) | 3 canais bidirecionais multi-instância | ✅ |

**Arquivos-chave:** `redis.client.ts`, `queues.ts`, `outbox.service.ts`, `priority-queues.ts`, `websocket.routes.ts`

---

## B07 — Backend Core
**Sprint:** 0, 1 | **Objetivo:** Motor central robusto

| Tecnologia | Função | Status |
|-----------|--------|--------|
| Fastify | Servidor HTTP principal (substituiu Express) | ✅ |
| Cluster Module | Pre-forking multi-CPU | ✅ |
| Graceful Shutdown | SIGTERM → drena conexões → fecha filas → encerra | ✅ |
| Zod Validation | Schemas em todas as rotas críticas | ✅ |
| Tenant Onboarding | 6 etapas automatizadas | ✅ |
| Plan Limits | Billing multi-tenant com limites por plano | ✅ |

**Arquivos-chave:** `server.ts`, `cluster.ts`, `zod-validator.ts`, `onboarding.service.ts`, `plan-limits.service.ts`

---

## B08 — Frontend
**Sprint:** 4 | **Objetivo:** Interface enterprise-grade

| Tecnologia | Função | Status |
|-----------|--------|--------|
| React 18 + Vite | SPA com HMR | ✅ |
| TanStack React Query | Data fetching + cache + realtime invalidation | ✅ |
| Zustand | State management | ✅ |
| Supabase Auth (JWT) | Autenticação migrada do Firebase | ✅ |
| Streaming SSE | Chat com resposta token-a-token | ✅ |
| Recharts | Gráficos do Dashboard | ✅ |
| Shadcn/UI + Tailwind | Design system | ✅ |
| Framer Motion | Animações | ✅ |

**Arquivos-chave:** `AuthContext.tsx`, `useChat.ts`, `Dashboard.tsx`, `Chat.tsx`, `Knowledge.tsx`, `CobraiAdmin.tsx`, `useWebSocket.ts`

---

## B09 — Segurança
**Sprint:** 0, 1 | **Objetivo:** Isolamento absoluto multi-tenant

| Tecnologia | Função | Status |
|-----------|--------|--------|
| JWT Rotation | Access 15min + Refresh 7 dias (opaco, revogável) | ✅ |
| Argon2id | Hashing de senhas (OWASP 2024) | ✅ |
| RBAC | 4 roles: viewer, operator, admin, super_admin | ✅ |
| HMAC-SHA256 | Validação de webhooks (timing-safe) | ✅ |
| RLS (Row Level Security) | Isolamento PostgreSQL por tenant_id | ✅ |
| Circuit Breaker (Opossum) | Fallback em OpenAI, WhatsApp, pagamentos | ✅ |
| Token Bucket Rate Limiting | Limites por rota e por tenant | ✅ |
| Idempotency Keys | UUID para rotas financeiras (TTL 24h) | ✅ |
| CSP Headers (Helmet) | Content Security Policy estrita | ✅ |

**Arquivos-chave:** `jwt.service.ts`, `password.service.ts`, `rbac.middleware.ts`, `hmac.service.ts`, `idempotency.middleware.ts`, `token-bucket.service.ts`, `circuit-breaker.config.ts`

---

## B10 — DevOps
**Sprint:** 3, 5 | **Objetivo:** Fábrica de deploys automatizada

| Tecnologia | Função | Status |
|-----------|--------|--------|
| Docker (multi-stage) | Containerização API + Web | ✅ |
| Docker Compose | Orquestração local (dev + prod) | ✅ |
| GitHub Actions | CI (lint→vitest→playwright→build) + Deploy + Security | ✅ |
| TurboRepo | Monorepo com cache (parcialmente ativo) | 🔶 |
| Pulumi IaC | Infraestrutura como código TypeScript | ⬜ Pendente |

**Arquivos-chave:** `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, `turbo.json`

---

## B11 — Observabilidade
**Sprint:** 3 | **Objetivo:** Visibilidade total do sistema

| Tecnologia | Função | Status |
|-----------|--------|--------|
| Pino.js | Logging estruturado JSON (zero console.log) | ✅ |
| Sentry | Error tracking + profiling + alertas | ✅ |
| LangSmith | Tracing de chamadas LLM + feedback loop | ✅ |
| Helicone | Custo por tenant em tempo real | ✅ |
| DuckDB Analytics | Relatórios OLAP pesados sem bloquear chat | ✅ |
| RAGAS | Avaliação de qualidade do RAG | ⬜ Pendente |
| LLM-as-a-Judge | Validação automática de respostas | ⬜ Pendente |

**Arquivos-chave:** `logger.ts`, `sentry.service.ts`, `langsmith.service.ts`, `helicone.service.ts`, `duckdb.service.ts`

---

## B12 — Padrões Arquiteturais
**Sprint:** 0 | **Objetivo:** Fundação que vai existir para sempre

| Tecnologia/Padrão | Função | Status |
|-------------------|--------|--------|
| DDD (Domain-Driven Design) | Estrutura hexagonal: domain/, infrastructure/, adapters/ | ✅ |
| Strangler Fig Pattern | Migração gradual Express → Fastify | ✅ |
| CRDTs (Yjs) | Edição colaborativa de tickets | ✅ |
| ETag Caching | Cache de respostas HTTP estáticas | ✅ |
| Memoization | Cache de cálculos pesados (LTV, churn) | ✅ |
| WAL (Write-Ahead Log) | Integridade transacional PostgreSQL | ✅ |
| Outbox Pattern | Consistência eventual entre serviços | ✅ |

---

## 🗺️ ORDEM DE DEPENDÊNCIA

```
B12 Padrões ← BASE
  ↓
B07 Backend ← Motor central
  ↓
B09 Segurança ← Auth + RLS
  ↓
B05 Dados ← Supabase + Qdrant + R2
  ↓
B06 Mensageria ← Redis + BullMQ
  ↓
B01 LLMs ← OpenAI + Routing
  ↓
B02 Guardrails ← Zod + PII + Injection
  ↓
B03 RAG ← Qdrant + Zep + HyDE
  ↓
B04 Agentes ← LangGraph + BullMQ
  ↓
B08 Frontend ← React + Zustand + WebSockets
  ↓
B10 DevOps ← Docker + CI/CD
  ↓
B11 Observabilidade ← Sentry + LangSmith + RAGAS
```

---

*Salvo em: 2026-06-28 | Referência permanente para migração*
