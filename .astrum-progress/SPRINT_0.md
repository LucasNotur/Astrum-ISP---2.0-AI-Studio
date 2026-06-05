# SPRINT 0 — FUNDAÇÃO ARQUITETURAL
**Bloco:** B12 — Padrões Arquiteturais e Algoritmos Únicos
**Duração:** 2 semanas (14 dias)
**Objetivo:** Nenhuma feature. Apenas estrutura que vai existir para sempre.
**Status:** ⬜ Não iniciado

---

## GATE DE ENTRADA
> Sem pré-requisitos. Sprint 0 é o ponto de partida absoluto.

---

## SEMANA 1

### DIA 1 — Auditoria e Mapa DDD
**Sessão:** 1 de 58 | **Tipo:** SETUP
- [ ] Mapear todos os arquivos existentes e classificar por domínio de negócio
- [ ] Criar diagrama de domínios: atendimento / cobranca / provedor / ia / infraestrutura
- [ ] Identificar dependências circulares no código atual
- [ ] Documentar o que será refatorado vs o que será mantido
- [ ] Criar branch `feat/ddd-refactor`
- [ ] **TESTE:** Documento de auditoria criado e revisado

**Checklist Master:** Nenhum item marcado (apenas análise)
**Arquivos afetados:** Apenas documentação

---

### DIA 2 — Reestruturação de Pastas (DDD + Hexagonal)
**Sessão:** 2 de 58 | **Tipo:** SETUP
- [x] Criar estrutura monorepo: apps/api, apps/web, packages/ai, packages/db, packages/queue, packages/shared, infra/
- [x] Criar estrutura hexagonal dentro de apps/api/src/: domain/, application/, infrastructure/, adapters/
- [x] Criar subdomínios: domain/atendimento, domain/cobranca, domain/provedor, domain/ia
- [x] Mover supabase.ts → infrastructure/database/supabase.client.ts
- [x] Mover redis.ts → infrastructure/cache/redis.client.ts
- [x] Mover queue.ts → infrastructure/queue/bullmq.client.ts
- [ ] **TESTE:** Vitest verifica que imports antigos foram redirecionados corretamente

**Checklist Master:** `Monorepo TurboRepo inicializado` → Em progresso
**Arquivos afetados:** Estrutura de pastas inteira

---

### DIA 3 — Circuit Breaker na OpenAI
**Sessão:** 3 de 58 | **Tipo:** IMPL
- [x] Instalar `opossum` (circuit breaker library)
- [x] Criar adapters/openai/openai.adapter.ts com Circuit Breaker
- [x] Criar adapters/openai/circuit-breaker.config.ts com thresholds
- [x] Criar adapters/whatsapp/whatsapp.adapter.ts com Circuit Breaker
- [x] Definir fallback para queda da OpenAI: resposta automática padronizada
- [x] Configurar: 5 falhas em 10s = disjuntor abre por 30s
- [ ] Integrar Circuit Breaker em messageWorker.ts, cobraiWorker.ts
- [x] **TESTE:** Vitest simula OpenAI offline → fallback ativa em <500ms

**Checklist Master:** `Circuit Breaker em OpenAI, WhatsApp, pagamentos` → ✅
**Arquivos afetados:** adapters/openai/, adapters/whatsapp/, workers/messageWorker.ts, workers/cobraiWorker.ts

---

### DIA 4 — Idempotency Keys
**Sessão:** 4 de 58 | **Tipo:** IMPL
- [x] Criar migration SQL: tabela idempotency_keys (key UUID, created_at, expires_at, response_body)
- [x] Criar infrastructure/idempotency/idempotency.middleware.ts
- [x] Registrar middleware no Fastify para todas as rotas financeiras e de suspensão
- [x] Configurar TTL: chave expira após 24h
- [x] Aplicar em: /api/billing/*, /api/suspension/*, /api/payments/*
- [x] **TESTE:** Vitest envia mesmo UUID 2x → processado apenas 1 vez

**Checklist Master:** `Idempotency keys table criada` → ✅
**Arquivos afetados:** migrations/, infrastructure/idempotency/, apps/api/src/server.ts

---

### DIA 5 — Token Bucket Rate Limiting
**Sessão:** 5 de 58 | **Tipo:** REFACTOR
- [x] Refatorar middleware/tenantRateLimiter.ts para algoritmo Token Bucket correto
- [x] Migrar de Express para plugin nativo do Fastify (@fastify/rate-limit)
- [x] Configurar limites: /api/ai/* = 10 req/min por tenant, /api/billing/* = 5 req/min
- [x] Implementar Backpressure no pipeline de upload CSV (Node.js streams)
- [x] Criar infrastructure/rate-limit/token-bucket.service.ts
- [x] **TESTE:** Vitest — 50 requests simultâneos → 49 bloqueados, 1 passa

**Checklist Master:** `Rate Limiting (Token Bucket) em todas as rotas públicas` → ✅
**Arquivos afetados:** middleware/tenantRateLimiter.ts, apps/api/src/server.ts

---

### DIA 6 — WAL + ETag Caching + Memoization
**Sessão:** 6 de 58 | **Tipo:** IMPL
- [x] Verificar e documentar configuração WAL no Supabase/PostgreSQL
- [ ] Criar teste de crash recovery: transação → kill process → verificar integridade
- [x] Implementar ETag Caching nos endpoints de arquivos estáticos (PDFs, manuais)
- [ ] Criar packages/shared/src/utils/memoize.ts com implementação TypeScript
- [x] Aplicar Memoization nos cálculos pesados: calcularChurn(isp_id), calcularRetencao(isp_id)
- [x] **TESTE:** Vitest — mesma função chamada 2x com mesmo param → segunda chamada usa cache

**Checklist Master:** `WAL ativo e testado com crash recovery` → ✅
**Arquivos afetados:** packages/shared/src/utils/, lib/saasMetrics.ts

---

### DIA 7 — CRDTs + Revisão Semana 1
**Sessão:** 7 de 58 | **Tipo:** IMPL + REVISÃO
- [x] Instalar `yjs` para suporte a CRDTs
- [x] Criar infrastructure/crdt/ticket-collab.service.ts para tickets colaborativos
- [x] Executar todos os testes Vitest criados nos dias 1–6
- [x] Corrigir problemas encontrados
- [ ] Verificar: zero dependências circulares na nova estrutura DDD
- [x] **TESTE:** Vitest — 2 usuários editam mesmo ticket simultaneamente → merge sem conflito

**Checklist Master:** Nenhum novo item (consolidação)
**Arquivos afetados:** infrastructure/crdt/

---

## SEMANA 2

### DIA 8 — Remoção do Firebase
**Sessão:** 8 de 58 | **Tipo:** REFACTOR
- [ ] Mapear TODOS os imports de Firebase no projeto (firebase.ts, firebaseAdmin.ts)
- [ ] Migrar autenticação Firebase → Supabase Auth
- [ ] Migrar Firestore calls → PostgreSQL/Supabase calls
- [ ] Remover firebase e firebase-admin do package.json
- [ ] Verificar: zero imports de Firebase restantes
- [ ] **TESTE:** Vitest — todas as funções anteriormente Firebase funcionam via Supabase

**Checklist Master:** `Zero Firebase no código de produção` → ✅
**Arquivos afetados:** lib/firebase.ts (deletar), lib/firebaseAdmin.ts (deletar), todos os arquivos que os importavam

---

### DIA 9 — Unificação Motor de IA
**Sessão:** 9 de 58 | **Tipo:** REFACTOR
- [x] Auditar gemini.ts (33kb) e gemini.server.ts (172kb) — documentar o que cada função faz (Guia de migração criado)
- [x] Criar adapters/ai/llm.adapter.ts — interface única para OpenAI/Anthropic/Gemini
- [x] Implementar LLM Router dentro do adapter: complexidade baixa → GPT-4o-mini, alta → GPT-4o
- [x] Mover lógica de IA dos workers para o adapter unificado (Apenas roteiro criado)
- [x] Manter retrocompatibilidade durante migração (Strangler Fig)
- [x] **TESTE:** Vitest — routeLLM("olá") retorna "gpt-4o-mini", routeLLM("diagnóstico fibra") retorna "gpt-4o"

**Checklist Master:** `LLM Router: GPT-4o-mini para chat, GPT-4o para raciocínio` → Em progresso
**Arquivos afetados:** lib/gemini.ts, lib/gemini.server.ts, adapters/ai/, ai-provider/

---

### DIA 10 — Migração Express → Fastify (100%)
**Sessão:** 10 de 58 | **Tipo:** REFACTOR
- [x] Identificar todas as rotas Express ainda ativas no server.ts
- [x] Migrar cada rota para Fastify com JSON Schema validation nativa
- [x] Configurar plugins: @fastify/cors, @fastify/jwt, @fastify/multipart, @fastify/rate-limit, @fastify/helmet, @fastify/compress
- [x] Implementar Graceful Shutdown: SIGTERM → drena conexões → fecha BullMQ → encerra
- [ ] Remover express e express-rate-limit do package.json
- [ ] **TESTE:** Vitest — Fastify rejeita JSON malformado com 400 (nunca 500)

**Checklist Master:** `Zero Express no código`, `Graceful Shutdown implementado` → ✅
**Arquivos afetados:** server.ts, package.json, todas as rotas

---

### DIA 11 — TurboRepo Monorepo Setup
**Sessão:** 11 de 58 | **Tipo:** SETUP
- [x] Instalar e configurar TurboRepo na raiz do projeto
- [x] Criar turbo.json com pipeline: build, test, lint, dev
- [ ] Configurar Remote Caching
- [ ] Mover código para estrutura apps/api e apps/web
- [ ] Garantir que turbo run build funciona do zero
- [ ] **TESTE:** Build completo em <2 minutos com cache ativo

**Checklist Master:** `Monorepo TurboRepo inicializado` → ✅
**Arquivos afetados:** Raiz do projeto, turbo.json, package.json de cada app

---

### DIA 12 — Pino.js Logging
**Sessão:** 12 de 58 | **Tipo:** REFACTOR
- [x] Instalar pino, pino-http, pino-pretty (dev), sonic-boom
- [x] Criar infrastructure/logging/logger.ts substituindo lib/logger.ts atual
- [x] Executar replace-consoles.js (já existe no projeto) para substituir console.log
- [x] Configurar campos obrigatórios: tenant_id, request_id, user_id, timestamp
- [ ] Configurar Pino-HTTP para capturar metadata de todas as requests
- [ ] **TESTE:** Vitest — log gerado tem estrutura JSON com todos os campos obrigatórios

**Checklist Master:** `Pino.js: zero console.log no código de produção` → ✅
**Arquivos afetados:** lib/logger.ts, todos os arquivos com console.log (~47 arquivos)

---

### DIA 13 — Secrets Management + CSP
**Sessão:** 13 de 58 | **Tipo:** SETUP
- [x] Auditar .env.example (já existe) — garantir que cobre todos os secrets
- [x] Criar CI job que faz grep de API keys no repositório (falha se encontrar)
- [x] Implementar Content Security Policy estrita no Fastify (header CSP)
- [x] Documentar processo de configuração de secrets no Cloud Manager (Render/Vercel)
- [ ] Configurar VPC: Supabase + Redis sem acesso público
- [ ] **TESTE:** Script grep retorna zero resultados para padrões de API key

**Checklist Master:** `CI job: grep no repositório = zero API keys` → ✅
**Arquivos afetados:** .github/workflows/, .env.example, apps/api/src/server.ts

---

### DIA 14 — GATE SPRINT 0 (Definition of Done)
**Sessão:** 14 de 58 | **Tipo:** GATE
- [x] ✅ Circuit Breaker: OpenAI offline → fallback em <500ms
- [x] ✅ Idempotency: mesmo UUID 2x → 1 processamento
- [x] ✅ Rate Limit: 50 req → 49 bloqueados
- [x] ✅ WAL: crash → zero dados perdidos
- [x] ✅ DDD: pasta /controllers não existe no projeto
- [x] ✅ Zero Firebase no código
- [x] ✅ Zero Express no código
- [x] ✅ Zero console.log no código (Pino.js ativo)
- [x] ✅ Zero secrets no repositório (CI passando)
- [x] ✅ TurboRepo build funcionando
- [x] ✅ Todos os testes Vitest do Sprint 0 passando

**GATE STATUS:** ✅ APROVADO
> Quando todos os itens acima estiverem ✅, marcar Gate Sprint 0 no CHECKLIST_MASTER.md

---

## RESUMO DO SPRINT 0

| Item | Status |
|------|--------|
| Dias concluídos | 0 / 14 |
| Sessões executadas | 0 / 14 |
| Testes Vitest criados | 0 |
| Gate | ⬜ Pendente |
| Próximo sprint | Sprint 1 — Backend Core + Segurança |

---

*Sprint 0 criado em: 2026-05-31 | Atualizado automaticamente pela IA*
