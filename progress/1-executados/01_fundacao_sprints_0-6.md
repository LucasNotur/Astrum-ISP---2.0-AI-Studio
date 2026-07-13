# Fundação — Sprints 0–6 (Sessões 1–67) — ✅ CONCLUÍDO (2026-05/06)

**Fonte:** `.astrum-progress/SPRINT_0__CONCLUIDO.md` … `SPRINT_6__ABSORVIDO_PELO_V2.md`, `12_BLOCOS_TECNOLOGICOS__CONCLUIDO.md`

**O que foi construído:** toda a base do produto em 12 blocos tecnológicos:

1. **Monorepo/DevOps** — TurboRepo, Docker Compose, CI, cluster Node.
2. **Backend novo (apps/api)** — Fastify + DDD (domain/adapters/infrastructure).
3. **Dados** — Supabase (Postgres + RLS multi-tenant), Redis (cache/filas), Qdrant (vetores), DuckDB (analytics).
4. **Mensageria** — BullMQ (14 workers), outbox pattern, webhooks Svix.
5. **LLMs** — GPT-4o-mini (conversa) / GPT-4o (orquestração), fallback multi-provider (OpenAI/Anthropic/Gemini), circuit breaker.
6. **Agente** — LangGraph com nós classify→guardrails→RAG→generate→validate→escalate.
7. **Guardrails** — pipeline de segurança de resposta + validação + escalação humana.
8. **RAG** — ingestão de documentos, chunking, embeddings, busca híbrida no Qdrant.
9. **Segurança** — JWT, RBAC por papel, RLS por tenant, audit log, LGPD (expurgo Art. 18).
10. **Frontend legado oficial** — 22 páginas React/Vite (R1), auth Supabase.
11. **Observabilidade** — Sentry, logs estruturados (pino), health checks, boot-state.
12. **E2E/Qualidade** — Vitest + Playwright.

**Resultado:** o esqueleto completo sobre o qual TUDO o resto foi construído.
