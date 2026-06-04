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
- [ ] Configurar Cluster Module: os.cpus().length workers
- [ ] Configurar pre-forking para aproveitar todos os CPUs
- [ ] Criar health check endpoint /health (status Redis + Supabase + Qdrant)
- [ ] Configurar @fastify/compress para respostas gzip automáticas
- [ ] Configurar @fastify/helmet para headers de segurança HTTP
- [ ] Benchmark com autocannon: confirmar >10k req/s
- [ ] **TESTE:** Vitest — /health retorna 200 com status de todos os serviços

**Checklist Master:** Nenhum novo item (otimização do existente)
**Blocos:** B07

---

### DIA 16 — WebSockets Bidirecionais
**Sessão:** 16 de 58 | **Tipo:** IMPL
- [ ] Instalar e configurar @fastify/websocket
- [ ] Criar adapters/websocket/websocket.adapter.ts
- [ ] Implementar autenticação JWT na abertura do WebSocket
- [ ] Implementar rooms por tenant_id (ISP A isolado do ISP B)
- [ ] Implementar reconexão automática no cliente React com backoff exponencial
- [ ] Atualizar componentes React do AstroChat para usar WebSocket
- [ ] **TESTE:** Vitest — 100 conexões simultâneas sem degradação de performance

**Checklist Master:** Nenhum item direto (infra para o frontend)
**Blocos:** B07
**Frontend afetado:** AstroChat UI — substituir polling por WebSocket

---

### DIA 17 — SSE Streaming de IA
**Sessão:** 17 de 58 | **Tipo:** IMPL
- [ ] Criar rota GET /api/ai/stream com Server-Sent Events
- [ ] Integrar Abort Controller: usuário cancela resposta em andamento
- [ ] Implementar indicador visual "IA pensando..." no frontend (componente React)
- [ ] Criar hook useSSEStream() no React para consumir o stream
- [ ] Testar: tokens da IA aparecem em <100ms de latência
- [ ] **TESTE:** Playwright — abrir chat, enviar mensagem, verificar tokens aparecendo um a um

**Checklist Master:** Nenhum item direto
**Blocos:** B07
**Frontend afetado:** AstroChat — componente de streaming

---

### DIA 18 — REST API + Webhooks HMAC
**Sessão:** 18 de 58 | **Tipo:** IMPL
- [ ] Criar adapters/webhooks/hmac-validator.ts
- [ ] Aplicar HMAC em todos os webhooks recebidos: WhatsApp/Evolution, pagamentos, ISP callbacks
- [ ] Instalar e configurar Svix para envio de webhooks para fora
- [ ] Criar adapters/webhooks/svix.adapter.ts
- [ ] Padronizar respostas de erro: { code, message, details, request_id }
- [ ] Testar: webhook sem assinatura HMAC → 401 imediato
- [ ] **TESTE:** Vitest — HMAC inválido rejeitado, HMAC válido processado

**Checklist Master:** `HMAC em todos os webhooks` → ✅
**Blocos:** B07

---

### DIA 19 — Cloudflare Workers Edge Auth
**Sessão:** 19 de 58 | **Tipo:** SETUP
- [ ] Criar Worker script para validação de JWT na borda
- [ ] Configurar bloqueio de IPs maliciosos na borda
- [ ] Configurar Rate Limiting na borda (Cloudflare dashboard)
- [ ] Testar: request com JWT inválido → bloqueado antes de chegar ao Node.js
- [ ] **TESTE:** Playwright — request com JWT inválido → 401 sem chegar ao servidor

**Checklist Master:** Nenhum item direto (segurança de borda)
**Blocos:** B07

---

### DIA 20 — Supabase Auth + RBAC Granular
**Sessão:** 20 de 58 | **Tipo:** IMPL
- [ ] Configurar JWT rotation: tokens expiram em 15 minutos com refresh automático
- [ ] Criar ENUM de roles: support_agent, manager, admin, super_admin
- [ ] Criar migration com RLS policies baseadas em role + tenant_id
- [ ] Implementar middleware RBAC no Fastify
- [ ] Atualizar menu do frontend: itens visíveis por role
- [ ] Testar: JWT expirado → 401, técnico em rota /admin → 403
- [ ] **TESTE:** Playwright — login como técnico, tentar acessar /admin → 403

**Checklist Master:** `JWT rotation: 15 minutos`, `RBAC: Técnico / Gestor / Admin testados` → ✅
**Blocos:** B09
**Frontend afetado:** Menu de navegação, rotas protegidas, componente de role badge

---

### DIA 21 — Argon2id + Caddy + WAF
**Sessão:** 21 de 58 | **Tipo:** IMPL + SETUP
- [ ] Instalar argon2 package
- [ ] Substituir qualquer bcrypt/md5/sha1 por Argon2id em toda a base
- [ ] Configurar Caddy como reverse proxy com HTTPS automático (Caddyfile)
- [ ] Configurar Cloudflare WAF: bloquear SQLi, XSS, prompt injection via HTTP
- [ ] Teste básico de segurança nas rotas críticas (OWASP Top 10)
- [ ] **TESTE:** Vitest — senha hasheada com Argon2id não é revertível com força bruta

**Checklist Master:** `Argon2id para todas as senhas` → ✅
**Blocos:** B09

---

## SEMANA 4

### DIA 22 — RLS Multi-tenant Production-Grade
**Sessão:** 22 de 58 | **Tipo:** IMPL
- [ ] Auditar TODAS as tabelas do Supabase — garantir RLS ativo em cada uma
- [ ] Criar teste automatizado: Provedor A faz query → 0 registros do Provedor B
- [ ] Criar Materialized Views para dashboards (recalcular à meia-noite via BullMQ)
- [ ] Criar índices otimizados para queries de atendimento em tempo real
- [ ] **TESTE:** Playwright — login ISP A, buscar clientes → ISP B não aparece

**Checklist Master:** `RLS em TODAS as tabelas desde a primeira migration` → ✅
**Blocos:** B09

---

### DIA 23 — Qdrant Dockerizado + Particionamento
**Sessão:** 23 de 58 | **Tipo:** SETUP + IMPL
- [ ] Instalar Qdrant via Docker Compose (adicionar ao docker-compose.yml)
- [ ] Criar coleção separada por ISP (nunca namespace global único)
- [ ] Configurar Snapshotting automático diário
- [ ] Implementar payload indexing: filtros por date, document_type, isp_id
- [ ] Atualizar lib/vectorStore.ts para usar particionamento por tenant
- [ ] **TESTE:** Vitest — query ISP A não retorna vetores do ISP B

**Checklist Master:** `Qdrant com particionamento por ISP` → ✅
**Blocos:** B05

---

### DIA 24 — Cloudflare R2 Object Storage
**Sessão:** 24 de 58 | **Tipo:** SETUP + IMPL
- [ ] Criar bucket R2 por tenant (áudios WhatsApp + PDFs + manuais)
- [ ] Configurar CORS correto no bucket
- [ ] Confirmar Zero Egress nas configurações
- [ ] Implementar S3 Intelligent-Tiering para arquivos >90 dias
- [ ] Implementar ETag headers em todos os arquivos servidos
- [ ] Atualizar lib/storage.ts para usar R2 em vez de Firebase Storage
- [ ] Criar componente React de upload com progresso visual
- [ ] **TESTE:** Vitest — upload de 10MB → download com ETag correto, zero custo egress

**Checklist Master:** `Cloudflare R2 com zero egress configurado` → ✅
**Blocos:** B05
**Frontend afetado:** Componente de upload de arquivos

---

### DIA 25 — DuckDB In-Process Analytics
**Sessão:** 25 de 58 | **Tipo:** IMPL
- [ ] Instalar duckdb package no Node.js
- [ ] Criar infrastructure/analytics/duckdb.service.ts
- [ ] Criar endpoint de upload de CSV/Excel → processado via DuckDB
- [ ] Garantir isolamento do Supabase durante análises pesadas
- [ ] Criar componente React de upload de relatório com resultado inline
- [ ] **TESTE:** Vitest — query de 100k registros via DuckDB em <2 segundos

**Checklist Master:** `DuckDB in-process para analytics pesados` → ✅
**Blocos:** B05
**Frontend afetado:** Página de relatórios — componente de upload + resultado DuckDB

---

### DIA 26 — Supabase Realtime CDC
**Sessão:** 26 de 58 | **Tipo:** IMPL
- [ ] Ativar Supabase Realtime nas tabelas: payments, tickets, signal_status, contracts
- [ ] Implementar CDC: pagamento confirmado → evento automático → BullMQ
- [ ] Atualizar frontend React: TanStack Query invalida cache ao receber evento CDC
- [ ] Testar consistência: mudança no DB → frontend atualiza em <500ms
- [ ] **TESTE:** Playwright — atualizar status no banco → UI atualiza sem reload

**Checklist Master:** `Supabase Realtime (CDC) nas tabelas críticas` → ✅
**Blocos:** B05
**Frontend afetado:** Todas as páginas com dados em tempo real

---

### DIA 27 — Redis Production-Grade
**Sessão:** 27 de 58 | **Tipo:** IMPL
- [ ] Configurar Redis com persistência AOF (Append-Only File) ativada
- [ ] Implementar Semantic Cache: respostas de IA cacheadas por similaridade de intent
- [ ] Configurar Redis para Rate Limiting por tenant (Token Bucket)
- [ ] Configurar Redis para sessões de contexto temporário da IA
- [ ] **TESTE:** Vitest — mesma query de IA em <200ms na segunda chamada (cache hit)

**Checklist Master:** Nenhum item novo (otimização do Redis existente)
**Blocos:** B06 (preparação)

---

### DIA 28 — GATE SPRINT 1 (Definition of Done)
**Sessão:** 28 de 58 | **Tipo:** GATE
- [ ] ✅ Fastify benchmark >10k req/s
- [ ] ✅ WebSocket: 100 conexões simultâneas estáveis
- [ ] ✅ SSE: streaming de tokens funcionando
- [ ] ✅ HMAC: 100% dos webhooks validados (zero falsos positivos/negativos)
- [ ] ✅ RBAC: técnico sem acesso admin (Playwright passando)
- [ ] ✅ JWT: expirado = 401 imediato
- [ ] ✅ Zero secrets no repositório (CI job passando)
- [ ] ✅ RLS: teste cross-tenant passando (Playwright)
- [ ] ✅ Qdrant: particionado por ISP, zero vazamento entre tenants
- [ ] ✅ DuckDB: 100k linhas em <2s
- [ ] ✅ CDC: evento em <500ms
- [ ] ✅ Todos os testes Vitest do Sprint 1 passando

**GATE STATUS:** ⬜ Pendente

---

## RESUMO DO SPRINT 1

| Item | Status |
|------|--------|
| Dias concluídos | 0 / 14 |
| Sessões executadas | 0 / 14 |
| Testes Vitest criados | 0 |
| Testes Playwright criados | 0 |
| Gate | ⬜ Pendente |
| Próximo sprint | Sprint 2 — Motor LLM + Guardrails + RAG |

---

*Sprint 1 criado em: 2026-05-31 | Atualizado automaticamente pela IA*
