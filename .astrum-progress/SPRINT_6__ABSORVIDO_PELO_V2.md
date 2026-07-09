# SPRINT 6 — Escala Multi-tenant

## Checklist de Conclusão do Sprint 6

### DIA 61 — Prompt Caching + Few-Shot Dinâmico
**Sessão:** 61 de 70 | **Tipo:** FinOps / Prompt Engineering
- [x] prompt-cache.service.ts
- [x] few-shot.service.ts
- [x] Redis cache de prompts (TTL 24h)
- [x] Few-shot Qdrant com fallbacks
- [x] Invalidação ao anexar documentos

### DIA 62 — OpenAI Batch API
**Sessão:** 62 de 70 | **Tipo:** FinOps / IA
- [x] batch.service.ts
- [x] batch.worker.ts
- [x] jobs agendados para OpenAI batch
- [x] migration 012_batch_api.sql

### DIA 63 — Hybrid Search BM25 + HyDE
**Sessão:** 63 de 70 | **Tipo:** RAG Avançado
- [x] hybrid-search.service.ts
- [x] collection-setup.service.ts com sparse vectors
- [x] HyDE: detecção automática de queries vagas
- [x] RRF: 0.7 dense + 0.3 sparse
- [x] migração de coleções antigas

### DIA 64 — Zep Memória de Longo Prazo
**Sessão:** 64 de 70 | **Tipo:** RAG + Memória
- [x] zep.service.ts
- [x] memory-composer.service.ts (3 camadas)
- [x] Fail-open sem ZEP_API_URL
- [x] Extração de entidades (plano, equipamento, endereço)
- [x] deleteCustomerMemory (LGPD)
- [x] Docker Compose com Zep self-hosted

### DIA 65 — LangGraph State Machine + Agentic RAG
**Sessão:** 65 de 70 | **Tipo:** Orquestração de Agentes
- [x] agent.state.ts (schema Zod)
- [x] agent.nodes.ts (8 nós)
- [x] langgraph.service.ts (grafo compilado)
- [x] Agentic RAG: decide_source
- [x] Edges condicionais (guardrails→block, validate→escalate)
- [x] Integração message.worker.ts

### DIA 66 — Cloudflare R2 + Outbox Pattern + Filas Prioritárias
**Sessão:** 66 de 70 | **Tipo:** Storage + Queue
- [x] r2.adapter.ts (upload/presign/delete)
- [x] outbox.service.ts (publish + processPending)
- [x] outbox.worker.ts (polling 5s)
- [x] Filas prioritárias (critical=10/normal=5/batch=1)
- [x] migration 013_outbox_r2.sql
- [x] Migração documentos → R2
- [x] .env.example atualizado

### DIA 67 — WebSockets Bidirecionais
**Sessão:** 67 de 70 | **Tipo:** Backend + Comunicação em Tempo Real
- [x] websocket.routes.ts (3 canais)
- [x] useWebSocket.ts + hooks especializados
- [x] Redis Pub/Sub multi-instância
- [x] Reconexão automática com backoff
- [x] wsPublisher integrado nos workers
- [x] Playwright E2E WS test

