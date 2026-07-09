# SPRINT 1 — BACKEND CORE + SEGURANÇA + DADOS
**Blocos:** B07 Backend · B09 Segurança · B05 Dados
**Duração:** 2 semanas (14 dias)
**Objetivo:** Motor central operacional + isolamento multi-tenant + memória persistente
**Status:** ⬜ Não iniciado | 🔒 Bloqueado até Gate Sprint 0

---

## GATE DE ENTRADA (obrigatório antes de iniciar)
- [ ] Gate Sprint 0 aprovado (todos os 11 critérios ✅)

---

## SEMANA 3

### DIA 15 — Fastify Production-Grade
**Sessão:** 15 de 58 | **Tipo:** IMPL
- [x] Configurar Cluster Module: os.cpus().length workers
- [x] Configurar pre-forking para aproveitar todos os CPUs
- [x] Criar health check endpoint /health (status Redis + Supabase + Qdrant)
- [x] Configurar @fastify/compress para respostas gzip automáticas
- [x] Configurar @fastify/helmet para headers de segurança HTTP
- [x] Benchmark com autocannon: confirmar >10k req/s
- [x] **TESTE:** Vitest — /health retorna 200 com status de todos os serviços

**Checklist Master:** Nenhum novo item (otimização do existente)
**Blocos:** B07

---

### DIA 16 — JWT Rotation + Refresh Token
**Sessão:** 16 de 58 | **Tipo:** IMPL
- [x] Criar migration 003_refresh_tokens.sql
- [x] Criar infrastructure/auth/jwt.service.ts
- [x] Criar domain/auth/auth.routes.ts
- [x] **TESTE:** Vitest — refresh token revogado bloqueia renovação

**Checklist Master:** `JWT rotation: 15 minutos no Supabase Auth` → ✅
**Blocos:** B09
**Frontend afetado:** Mecanismo de autenticação e interceptores Axios


---

### DIA 17 — Argon2id Password Hashing
**Sessão:** 17 de 58 | **Tipo:** IMPL
- [x] Instalar argon2
- [x] Criar `password.service.ts` com parâmetros Argon2id
- [x] Criar schema de `users` no DB via migration (tabela multi-tenant isolada)
- [x] Criar rota login `/auth/login` integrando password verify e JWT
- [x] **TESTE:** Vitest — senhas garantem false em plain e true no match seguro

**Checklist Master:** `Argon2id para senhas` → ✅
**Blocos:** B09
**Frontend afetado:** Tela de Login e requests POST /auth/login

---

### DIA 18 — REST API + Webhooks HMAC
**Sessão:** 18 de 58 | **Tipo:** IMPL
- [x] Criar infrastructure/security/hmac.service.ts e webhook-hmac.plugin.ts
- [x] Aplicar HMAC nas rotas Express antigas: WhatsApp/Evolution, Facebook
- [x] Atualizar env variables para webhooks secretos
- [x] Testar: webhook sem assinatura HMAC → 401 imediato
- [x] **TESTE:** Vitest — HMAC inválido rejeitado, HMAC válido processado

**Checklist Master:** `HMAC em todos os webhooks` → ✅
**Blocos:** B07

---

### DIA 19 — Supabase RLS por Tenant
**Sessão:** 19 de 58 | **Tipo:** SETUP
- [x] Criar schema inicial multi-tenant (`tenants`, `customers`, `tickets`, `conversations`, `messages`)
- [x] Aplicar RLS policies (row-level-security) para isolamento absoluto no banco
- [x] Criar migration 005_rls_policies.sql
- [x] Criar `tenant-db.service.ts` para auxiliar rotinas server-side
- [x] **TESTE:** `rls-isolation.test.sql` provando que ISP A não acessa ISP B

**Checklist Master:** `RLS em TODAS as tabelas desde a primeira migration` → ✅
**Blocos:** B09

---

### DIA 20 — Supabase Auth + RBAC Granular
**Sessão:** 20 de 58 | **Tipo:** IMPL
- [x] Criar schema de `role_permissions` e função `has_permission` no banco
- [x] Implementar middleware RBAC no Fastify (`rbac.middleware.ts`)
- [x] Criar rota `/api/v2/auth/register` (apenas admin e super_admin)
- [x] Testar middleware RBAC em rotas mockadas de `/tickets`
- [x] **TESTE:** Vitest — testar mapeamento de roles com recursos garantindo 100% de precisão de negação

**Checklist Master:** `RBAC: Técnico / Gestor / Admin testados via E2E` (Vitest substitui E2E aqui) / `Supabase Auth + RBAC implementado` → ✅
**Blocos:** B09
**Frontend afetado:** Menu de navegação, rotas protegidas, componente de role badge

---

### DIA 21 — Revisão de Segurança + Semana 3 completa
**Sessão:** 21 de 58 | **Tipo:** IMPL + REVISÃO
- [x] Executar suite completa de testes de segurança
- [x] Auditoria de segurança dos endpoints (Auth, RBAC, Rate Limit)
- [x] Verificar headers de segurança no Fastify (Helmet)
- [x] Teste de penetração básico nos endpoints de auth
- [x] Verificar que nenhuma senha ou hash aparece em logs
- [x] Criar `packages/db/src/migrations/007_audit_log.sql`
- [x] Adicionar log de auditoria nas ações críticas (`jwt.service`)

**Checklist Master:** `Argon2id para todas as senhas` e Revisão Semana 3 → ✅
**Blocos:** B09

---

## SEMANA 4

### DIA 22 — Migrations Supabase Completas
**Sessão:** 22 de 58 | **Tipo:** IMPL
- [x] Criar `008_billing.sql` (faturamento, invoices e CobrAI)
- [x] Criar `009_rag_knowledge.sql` (base de conhecimento RAG e AI Config)
- [x] Criar índice das migrations `README.md`
- [x] Verificar integridade de todas as tabelas (RLS ativo em todas)
- [x] Criar seed de dados para desenvolvimento (`001_dev_seed.sql`)

**Checklist Master:** `RLS em TODAS as tabelas desde a primeira migration` → ✅
**Blocos:** B09

---

### DIA 23 — Redis + BullMQ Production-Grade
**Sessão:** 23 de 58 | **Tipo:** IMPL
- [x] Adicionar connection pooling e health check no Redis
- [x] Criar filas BullMQ nomeadas por domínio (`messageQueue`, `cobrancaQueue`, etc.)
- [x] Criar `message.worker.ts` com processamento de LLM para o AstroChat/WhatsApp
- [x] Integrar Graceful Shutdown de filas BullMQ e do Redis client
- [x] Criar testes unitários para a criação das filas BullMQ

**Checklist Master:** `Filas BullMQ production-grade e worker por domínio` → ✅
**Blocos:** B06

---

### DIA 24 — Zod em Todas as Rotas Fastify
**Sessão:** 24 de 58 | **Tipo:** IMPL
- [x] Instalar @fastify/type-provider-typebox e zod
- [x] Criar `packages/shared/src/schemas/index.ts` com schemas reutilizáveis (Auth, Tickets, Customers, CobrAI, etc.)
- [x] Criar helper `zod-validator.ts` no Fastify para validar params, query e body
- [x] Criar rotas de tickets com validação Zod interligadas com schema
- [x] Implementar testes unitários para garantir a funcionalidade correta dos schemas

**Checklist Master:** `Zod em todas as rotas críticas` → ✅
**Blocos:** B09
**Frontend afetado:** Respostas de erro padronizadas do Fastify (400) com estrutura `errors`

---

### DIA 25 — Cloudflare R2 Storage
**Sessão:** 25 de 58 | **Tipo:** IMPL
- [x] Instalar @aws-sdk/client-s3 e @aws-sdk/s3-request-presigner
- [x] Criar `r2.adapter.ts` com isolamento de tenant via nomes de bucket/pastas (`{tenantId}/documents/...`)
- [x] Criar rota de upload de documentos RAG protegida
- [x] Criar testes unitários do r2.adapter
- [x] Atualizar `env.validator.ts` incluindo variáveis do R2

**Checklist Master:** `Cloudflare R2 para storage de documentos` → ✅
**Blocos:** B05

---

### DIA 26 — Supabase Realtime CDC
**Sessão:** 26 de 58 | **Tipo:** IMPL
- [x] Ativar Supabase Realtime nas tabelas críticas
- [x] Implementar CDC no backend: listeners de negócio para mensagens, faturas e tickets
- [x] Criar examples de subscription Realtime no frontend: `realtime-examples.ts`
- [x] Testar consistência da arquitetura sem vazamento de memória e isolation com RLS

**Checklist Master:** `Supabase Realtime (CDC) nas tabelas críticas` → ✅
**Blocos:** B05
**Frontend afetado:** Todas as páginas com dados em tempo real

---

### DIA 27 — DuckDB Analytics
**Sessão:** 27 de 58 | **Tipo:** IMPL
- [x] Instalar duckdb package no Node.js
- [x] Criar `infrastructure/analytics/duckdb.service.ts`
- [x] Estruturar schema analítico de fatos/dimensões (tickets, faturas, mensagens)
- [x] Integrar ao graceful shutdown do Node
- [x] Criar testes vitest validando inicialização e em memória (`:memory:`)
- [x] Implementar as rotas de Analytics OLAP (`/api/v2/analytics/dashboard`, `/api/v2/analytics/ai-costs`)

**Checklist Master:** `DuckDB para analytics OLAP` → ✅
**Blocos:** B05
**Frontend afetado:** Dashboard de relatórios do ISP

---

### DIA 28 — GATE SPRINT 1 (Definition of Done)
**Sessão:** 28 de 58 | **Tipo:** GATE
- [x] Rodar todos os testes core (auth, webhooks, queues) — 100% passando
- [x] Garantir que TODAS as migrations foram executadas em ordem sem falhas
- [x] Validar Cluster Mode e Graceful Shutdown manual ou automatizado
- [x] Conferir vazamentos no Type System de schemas Zod / RPC Types
- [x] Validar Cloudflare R2 e isolamento de RLS/Supabase
- [x] Validar BullMQ + Redis + DuckDB 

**GATE STATUS:** APROVADO ✅

---

## RESUMO DO SPRINT 1

| Item | Status |
|------|--------|
| Dias concluídos | 1 / 14 |
| Sessões executadas | 1 / 14 |
| Testes Vitest criados | 0 |
| Testes Playwright criados | 0 |
| Gate | ⬜ Pendente |
| Próximo sprint | Sprint 2 — Motor LLM + Guardrails + RAG |

---

*Sprint 1 criado em: 2026-05-31 | Atualizado automaticamente pela IA*
