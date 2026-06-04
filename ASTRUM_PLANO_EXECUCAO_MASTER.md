# ASTRUM AI ENGINE â€” PLANO DE EXECUÃ‡ÃƒO ULTRA-DETALHADO
## Parte 1: Sprint 0 a Sprint 3 (Semanas 1â€“8)

### DIAGNÃ“STICO DO CÃ“DIGO ATUAL (base para o plano)
**O que JÃ EXISTE na Astrum:**
- Express + Fastify (ambos coexistindo â€” precisa migrar 100% para Fastify)
- Redis + BullMQ (workers existem: messageWorker, cobraiWorker, fcrWorker, etc.)
- Supabase (supabase.ts, dbAdmin.ts, db.ts)
- Qdrant (@qdrant/js-client-rest instalado, vectorStore.ts existe)
- OpenAI + Anthropic + Google Gemini (todos instalados â€” precisa unificar)
- Zod (instalado), Zustand (instalado), TanStack Query (instalado)
- Vitest (configurado), framer-motion (instalado)
- Firebase (ainda presente â€” legado a ser removido)
- Rate Limiter (tenantRateLimiter.ts existe), Guardrails (guardrails.ts existe)
- embeddingProvider.ts, routingEngine.ts, toolRegistry.ts existem

**O que FALTA implementar:**
- Helicone (observabilidade de custo por ISP)
- LangGraph (orquestraÃ§Ã£o de agentes em state machine)
- Microsoft Presidio (anonimizaÃ§Ã£o PII)
- Zep/Mem0 (memÃ³ria de longo prazo)
- LangSmith (tracing de LLMs)
- RAGAS (avaliaÃ§Ã£o do RAG)
- Pino.js (substituir console.log)
- Cloudflare R2 (storage sem egress)
- DuckDB (analytics in-process)
- TurboRepo (monorepo)
- GitHub Actions CI/CD completo
- Pulumi IaC
- Argon2id (senhas)
- DDD/Hexagonal (reestruturaÃ§Ã£o de pastas)

---

## SPRINT 0 â€” FUNDAÃ‡ÃƒO ARQUITETURAL
### DuraÃ§Ã£o: 2 semanas | Bloco 12 (PadrÃµes)
### Objetivo: Nenhuma feature. Apenas estrutura que vai existir para sempre.

---

#### SEMANA 1 (Dias 1â€“7)

**Dia 1 â€” Auditoria e Mapa DDD**
- [ ] Mapear todos os arquivos existentes e classificar por domÃ­nio de negÃ³cio
- [ ] Criar diagrama de domÃ­nios: `atendimento` / `cobranca` / `provedor` / `ia` / `infraestrutura`
- [ ] Identificar dependÃªncias circulares no cÃ³digo atual
- [ ] Documentar o que serÃ¡ refatorado vs o que serÃ¡ mantido
- [ ] Criar branch `feat/ddd-refactor` para trabalho isolado

**Dia 2 â€” ReestruturaÃ§Ã£o de Pastas (DDD + Hexagonal)**
- [ ] Criar estrutura de monorepo base:
  ```
  astrum/
  â”œâ”€â”€ apps/api/         (Node.js + Fastify â€” motor central)
  â”œâ”€â”€ apps/web/         (React 18 + Vite SPA)
  â”œâ”€â”€ packages/ai/      (LangGraph + Vercel AI SDK + Guardrails)
  â”œâ”€â”€ packages/db/      (Supabase schema + RLS + migrations)
  â”œâ”€â”€ packages/queue/   (BullMQ workers + DLQ)
  â”œâ”€â”€ packages/shared/  (Zod schemas + tipos compartilhados)
  â””â”€â”€ infra/            (Pulumi IaC)
  ```
- [ ] Dentro de `apps/api/` criar estrutura hexagonal:
  ```
  apps/api/src/
  â”œâ”€â”€ domain/
  â”‚   â”œâ”€â”€ atendimento/  (Tickets, Chat, Clientes)
  â”‚   â”œâ”€â”€ cobranca/     (CobrAI, Faturas, Pagamentos)
  â”‚   â”œâ”€â”€ provedor/     (ISP, Contratos, Planos)
  â”‚   â””â”€â”€ ia/           (Prompts, Agentes, RAG)
  â”œâ”€â”€ application/      (Use cases â€” lÃ³gica de negÃ³cio pura)
  â”œâ”€â”€ infrastructure/   (Supabase, Redis, BullMQ)
  â””â”€â”€ adapters/         (OpenAI, Qdrant, WhatsApp, Evolution API)
  ```
- [ ] Mover `src/lib/supabase.ts` â†’ `infrastructure/database/supabase.client.ts`
- [ ] Mover `src/lib/redis.ts` â†’ `infrastructure/cache/redis.client.ts`
- [ ] Mover `src/lib/queue.ts` â†’ `infrastructure/queue/bullmq.client.ts`

**Dia 3 â€” Circuit Breaker (Bloco 12)**
- [ ] Instalar `opossum` (circuit breaker library para Node.js)
- [ ] Criar `adapters/openai/openai.adapter.ts` com Circuit Breaker implementado
- [ ] Criar `adapters/whatsapp/whatsapp.adapter.ts` com Circuit Breaker
- [ ] Definir fallback para queda da OpenAI: resposta automÃ¡tica de "Sistema em manutenÃ§Ã£o"
- [ ] Configurar threshold: 5 falhas em 10s = disjuntor abre por 30s
- [ ] Escrever teste unitÃ¡rio: simular OpenAI offline â†’ fallback ativa em <500ms
- [ ] CRITÃ‰RIO: Circuit Breaker testado com sucesso âœ“

**Dia 4 â€” Idempotency Keys (Bloco 12)**
- [ ] Criar migration SQL: tabela `idempotency_keys (key UUID, created_at, expires_at, response_body)`
- [ ] Implementar middleware `idempotencyMiddleware.ts` no Fastify
- [ ] Aplicar em TODAS as rotas financeiras e de suspensÃ£o de sinal
- [ ] Testar: enviar mesmo UUID 2x â†’ processado apenas 1 vez
- [ ] Configurar TTL: chave expira apÃ³s 24h automaticamente
- [ ] CRITÃ‰RIO: IdempotÃªncia cobrindo 100% das rotas crÃ­ticas âœ“

**Dia 5 â€” Token Bucket Rate Limiting (Bloco 12)**
- [ ] Refatorar `src/middleware/tenantRateLimiter.ts` para usar algoritmo Token Bucket correto
- [ ] Implementar como plugin nativo do Fastify (nÃ£o Express)
- [ ] Configurar limites por rota: `/api/ai/*` = 10 req/min por tenant, `/api/billing/*` = 5 req/min
- [ ] Implementar Backpressure no pipeline de upload de CSV
- [ ] Testar: 50 requests simultÃ¢neos â†’ 49 bloqueados, 1 passa
- [ ] CRITÃ‰RIO: Rate limiting funcionando no Fastify âœ“

**Dia 6 â€” Write-Ahead Logging + ETag Caching (Bloco 12)**
- [ ] Verificar e ativar WAL no Supabase/PostgreSQL (configuraÃ§Ã£o do projeto)
- [ ] Criar teste de crash recovery: iniciar transaÃ§Ã£o â†’ matar processo â†’ verificar integridade
- [ ] Implementar ETag Caching nos endpoints de arquivos estÃ¡ticos (manuais PDF, imagens)
- [ ] Implementar Memoization nos cÃ¡lculos pesados de churn/retenÃ§Ã£o por ISP
- [ ] Criar `packages/shared/src/utils/memoize.ts` com implementaÃ§Ã£o limpa
- [ ] CRITÃ‰RIO: WAL verificado + ETag funcionando âœ“

**Dia 7 â€” CRDTs + RevisÃ£o Sprint 0 Semana 1**
- [ ] Pesquisar e instalar biblioteca CRDT adequada para Node.js (`yjs` ou `automerge`)
- [ ] Preparar estrutura para tickets colaborativos (mÃºltiplos agentes editando simultaneamente)
- [ ] Revisar todas as implementaÃ§Ãµes dos dias 1â€“6
- [ ] Executar todos os testes criados na semana
- [ ] Corrigir problemas encontrados
- [ ] Atualizar documentaÃ§Ã£o das decisÃµes tomadas
- [ ] CRITÃ‰RIO: Semana 1 do Sprint 0 100% concluÃ­da âœ“

---

#### SEMANA 2 (Dias 8â€“14)

**Dia 8 â€” RemoÃ§Ã£o do Firebase (Legado)**
- [ ] Mapear TODOS os usos de Firebase no cÃ³digo (`src/lib/firebase.ts`, `src/lib/firebaseAdmin.ts`)
- [ ] Criar plano de migraÃ§Ã£o Firebase â†’ Supabase para cada uso encontrado
- [ ] Migrar autenticaÃ§Ã£o Firebase â†’ Supabase Auth
- [ ] Migrar Firestore calls â†’ PostgreSQL/Supabase calls
- [ ] Remover dependÃªncias: `firebase`, `firebase-admin` do package.json
- [ ] CRITÃ‰RIO: Zero imports de Firebase no cÃ³digo de produÃ§Ã£o âœ“

**Dia 9 â€” UnificaÃ§Ã£o do Motor de IA (eliminar Anthropic/Gemini diretos)**
- [ ] Auditar `src/lib/gemini.ts`, `src/lib/gemini.server.ts` (172kb â€” arquivo gigante)
- [ ] Auditar `src/ai-provider/ai-provider.service.ts`
- [ ] Criar `adapters/ai/llm.adapter.ts` â€” interface Ãºnica que abstrai OpenAI/Anthropic/Gemini
- [ ] Implementar LLM Router dentro do adapter: complexidade baixa â†’ GPT-4o-mini, alta â†’ GPT-4o
- [ ] Mover toda lÃ³gica de IA dos workers para o adapter unificado
- [ ] CRITÃ‰RIO: Um Ãºnico ponto de entrada para todas as chamadas LLM âœ“

**Dia 10 â€” MigraÃ§Ã£o Express â†’ Fastify (100%)**
- [ ] Identificar todas as rotas Express ainda ativas no `server.ts`
- [ ] Migrar cada rota para Fastify com validaÃ§Ã£o de JSON Schema nativa
- [ ] Configurar plugins Fastify: `@fastify/cors`, `@fastify/jwt`, `@fastify/multipart`, `@fastify/rate-limit`
- [ ] Implementar Graceful Shutdown: SIGTERM â†’ drena conexÃµes â†’ fecha BullMQ â†’ encerra
- [ ] Remover dependÃªncia `express` e `express-rate-limit` do package.json
- [ ] Benchmark: Fastify deve processar >10k req/s
- [ ] CRITÃ‰RIO: Zero rotas Express em produÃ§Ã£o âœ“

**Dia 11 â€” TurboRepo Monorepo Setup**
- [ ] Instalar e configurar TurboRepo na raiz do projeto
- [ ] Criar `turbo.json` com pipeline: `build`, `test`, `lint`, `dev`
- [ ] Configurar Remote Caching (Vercel Remote Cache ou self-hosted)
- [ ] Mover cÃ³digo atual para estrutura `apps/api` e `apps/web`
- [ ] Garantir que `turbo run build` funciona do zero
- [ ] CRITÃ‰RIO: Build completo em <2 minutos com cache âœ“

**Dia 12 â€” Pino.js Logging (Bloco 11 â€” setup inicial)**
- [ ] Instalar `pino`, `pino-http`, `pino-pretty` (dev), `sonic-boom`
- [ ] Criar `infrastructure/logging/logger.ts` substituindo o `src/lib/logger.ts` atual
- [ ] Executar script `replace-consoles.js` (jÃ¡ existe no projeto!) para substituir console.log
- [ ] Configurar campos obrigatÃ³rios em todo log: `tenant_id`, `request_id`, `user_id`, `timestamp`
- [ ] Configurar Pino-HTTP capturando metadata de todas as requests automaticamente
- [ ] CRITÃ‰RIO: Zero console.log em cÃ³digo de produÃ§Ã£o âœ“

**Dia 13 â€” Secrets Management + CSP**
- [ ] Auditar `.env.example` (jÃ¡ existe) â€” garantir que cobre todos os secrets necessÃ¡rios
- [ ] Mover TODOS os secrets para Cloud Secrets Manager (Render/Vercel)
- [ ] Configurar CI job que faz `grep` de API keys no repositÃ³rio (falha se encontrar)
- [ ] Implementar Content Security Policy estrita no Fastify (header `Content-Security-Policy`)
- [ ] Configurar VPC Peering: Supabase + Redis sem acesso pÃºblico direto
- [ ] CRITÃ‰RIO: grep no repositÃ³rio = zero API keys encontradas âœ“

**Dia 14 â€” Definition of Done Sprint 0**
- [ ] Executar TODOS os testes do Sprint 0
- [ ] Circuit Breaker: simular queda OpenAI â†’ fallback <500ms âœ“
- [ ] Idempotency: mesmo UUID 2x â†’ 1 processamento âœ“
- [ ] Rate Limit: 50 req â†’ 49 bloqueados âœ“
- [ ] WAL: crash durante transaÃ§Ã£o â†’ zero dados perdidos âœ“
- [ ] DDD: pasta /controllers nÃ£o existe no projeto âœ“
- [ ] Zero Firebase no cÃ³digo âœ“
- [ ] Zero console.log no cÃ³digo âœ“
- [ ] Zero secrets no repositÃ³rio âœ“
- [ ] **GATE SPRINT 0 APROVADO** â†’ AvanÃ§ar para Sprint 1 âœ“
# ASTRUM â€” PLANO DE EXECUÃ‡ÃƒO â€” PARTE 2
## Sprint 1 a Sprint 4 (Semanas 3â€“10)

---

## SPRINT 1 â€” BACKEND CORE + SEGURANÃ‡A
### DuraÃ§Ã£o: 2 semanas | Blocos 7 + 9

---

#### SEMANA 3 (Dias 15â€“21)

**Dia 15 â€” Fastify Production-Grade (Bloco 7)**
- [ ] Configurar Cluster Module no Node.js para usar todos os CPUs disponÃ­veis
- [ ] Implementar pre-forking: `os.cpus().length` workers
- [ ] Configurar health check endpoint `/health` com status do Redis e Supabase
- [ ] Configurar `@fastify/compress` para respostas gzip automÃ¡ticas
- [ ] Adicionar `@fastify/helmet` para headers de seguranÃ§a HTTP automÃ¡ticos
- [ ] Benchmark com autocannon: confirmar >10k req/s
- [ ] CRITÃ‰RIO: Fastify production-grade rodando âœ“

**Dia 16 â€” WebSockets Bidirecionais (Bloco 7)**
- [ ] Instalar e configurar `@fastify/websocket`
- [ ] Criar `adapters/websocket/websocket.adapter.ts`
- [ ] Implementar autenticaÃ§Ã£o JWT na abertura do WebSocket
- [ ] Implementar rooms por tenant_id (ISP A nÃ£o recebe mensagens do ISP B)
- [ ] Implementar reconexÃ£o automÃ¡tica no cliente React com backoff exponencial
- [ ] Testar com 100 conexÃµes simultÃ¢neas sem degradaÃ§Ã£o
- [ ] CRITÃ‰RIO: WebSocket estÃ¡vel com 100 conexÃµes âœ“

**Dia 17 â€” SSE Streaming de IA (Bloco 7)**
- [ ] Implementar Server-Sent Events para streaming de tokens da IA
- [ ] Criar rota `GET /api/ai/stream` com SSE
- [ ] Integrar Abort Controller: usuÃ¡rio pode cancelar resposta em andamento
- [ ] Implementar indicador visual "IA pensando..." no frontend
- [ ] Testar: tokens da IA aparecem no front em <100ms de latÃªncia
- [ ] CRITÃ‰RIO: Streaming de tokens funcionando âœ“

**Dia 18 â€” REST API + Webhooks HMAC (Bloco 7)**
- [ ] Implementar middleware HMAC para todos os webhooks recebidos (WhatsApp/Evolution API, pagamentos)
- [ ] Criar `adapters/webhooks/hmac.validator.ts`
- [ ] Instalar e configurar Svix para envio de webhooks para fora
- [ ] Padronizar respostas de erro: `{ code, message, details, request_id }`
- [ ] Testar: webhook sem assinatura HMAC â†’ 401 imediato
- [ ] CRITÃ‰RIO: HMAC validando 100% dos webhooks âœ“

**Dia 19 â€” Cloudflare Workers Edge Auth (Bloco 7)**
- [ ] Criar Worker script para validaÃ§Ã£o de JWT na borda (antes de chegar ao Node.js)
- [ ] Configurar bloqueio de IPs maliciosos na borda
- [ ] Configurar Rate Limiting na borda (Cloudflare)
- [ ] Testar: request com JWT invÃ¡lido â†’ bloqueado antes do Node.js
- [ ] CRITÃ‰RIO: Edge auth funcionando na borda âœ“

**Dia 20 â€” Supabase Auth + RBAC (Bloco 9)**
- [ ] Configurar JWT rotation: tokens expiram em 15 minutos com refresh automÃ¡tico
- [ ] Criar ENUM de roles no Supabase: `support_agent`, `manager`, `admin`, `super_admin`
- [ ] Implementar RBAC granular: permissÃµes atÃ´micas por recurso
- [ ] Criar migration com RLS policies baseadas em role + tenant_id
- [ ] Testar: JWT expirado â†’ 401 imediato, nunca 200
- [ ] Testar: tÃ©cnico tenta acessar /admin â†’ 403
- [ ] CRITÃ‰RIO: RBAC + JWT Rotation funcionando âœ“

**Dia 21 â€” Argon2id + Caddy + WAF (Bloco 9)**
- [ ] Instalar `argon2` para hashing de senhas
- [ ] Substituir qualquer bcrypt/md5/sha1 por Argon2id
- [ ] Configurar Caddy como reverse proxy com HTTPS automÃ¡tico
- [ ] Configurar Cloudflare WAF: bloquear SQLi, XSS, prompt injection via HTTP
- [ ] Teste de penetraÃ§Ã£o bÃ¡sico nas rotas crÃ­ticas (OWASP Top 10)
- [ ] CRITÃ‰RIO: Zero senhas em formato inseguro âœ“

---

#### SEMANA 4 (Dias 22â€“28)

**Dia 22 â€” RLS Multi-tenant Production-Grade (Bloco 9)**
- [ ] Auditar TODAS as tabelas do Supabase â€” garantir RLS ativo em cada uma
- [ ] Criar teste automatizado: Provedor A faz query â†’ resultado 0 registros do Provedor B
- [ ] Implementar materialized views para dashboards (recalculadas Ã  meia-noite)
- [ ] Criar Ã­ndices otimizados para queries de atendimento em tempo real
- [ ] CRITÃ‰RIO: Teste automatizado de isolamento cross-tenant passando âœ“

**Dia 23 â€” Qdrant Dockerizado com Particionamento (Bloco 5)**
- [ ] Instalar Qdrant via Docker Compose no ambiente de desenvolvimento
- [ ] Criar coleÃ§Ã£o separada por ISP (nunca namespace global Ãºnico)
- [ ] Configurar Snapshotting automÃ¡tico diÃ¡rio
- [ ] Implementar payload indexing: filtros por `date`, `document_type`, `isp_id`
- [ ] Testar: query de ISP A nÃ£o retorna vetores do ISP B
- [ ] CRITÃ‰RIO: Qdrant particionado por tenant âœ“

**Dia 24 â€” Cloudflare R2 Object Storage (Bloco 5)**
- [ ] Criar bucket R2 por tenant para Ã¡udios WhatsApp e PDFs
- [ ] Configurar CORS correto no bucket
- [ ] Confirmar Zero Egress nas configuraÃ§Ãµes
- [ ] Implementar S3 Intelligent-Tiering para arquivos >90 dias
- [ ] Implementar ETag headers em todos os arquivos servidos
- [ ] Testar: upload de arquivo 10MB â†’ download sem custo de egress
- [ ] CRITÃ‰RIO: R2 funcionando com zero egress âœ“

**Dia 25 â€” DuckDB In-Process Analytics (Bloco 5)**
- [ ] Instalar `duckdb` package no Node.js
- [ ] Criar `infrastructure/analytics/duckdb.service.ts`
- [ ] Implementar endpoint de upload de CSV/Excel processado via DuckDB
- [ ] Garantir isolamento total do Supabase durante anÃ¡lises pesadas
- [ ] Testar: query de 100k registros via DuckDB em <2 segundos
- [ ] CRITÃ‰RIO: DuckDB rodando in-process âœ“

**Dia 26 â€” Supabase Realtime CDC (Bloco 5)**
- [ ] Ativar Supabase Realtime nas tabelas crÃ­ticas: `payments`, `tickets`, `signal_status`
- [ ] Implementar CDC: pagamento confirmado â†’ evento automÃ¡tico â†’ BullMQ
- [ ] Testar consistÃªncia: mudanÃ§a no DB â†’ frontend atualiza em <500ms
- [ ] CRITÃ‰RIO: CDC disparando em <500ms âœ“

**Dia 27 â€” Redis Production-Grade (Bloco 6)**
- [ ] Configurar Redis com persistÃªncia AOF (Append-Only File) ativada
- [ ] Implementar Semantic Cache: respostas de IA cacheadas por similaridade de intent
- [ ] Configurar Redis para Rate Limiting por tenant via Token Bucket
- [ ] Configurar Redis para sessÃµes de contexto da IA
- [ ] CRITÃ‰RIO: Redis com persistÃªncia e cache semÃ¢ntico âœ“

**Dia 28 â€” Definition of Done Sprint 1**
- [ ] Fastify benchmark >10k req/s âœ“
- [ ] WebSocket: 100 conexÃµes simultÃ¢neas estÃ¡veis âœ“
- [ ] SSE: streaming de tokens funcionando âœ“
- [ ] HMAC: 100% dos webhooks validados âœ“
- [ ] RBAC: tÃ©cnico sem acesso admin âœ“
- [ ] JWT: expirado = 401 imediato âœ“
- [ ] Zero secrets no repositÃ³rio (CI job passando) âœ“
- [ ] RLS: teste cross-tenant passando âœ“
- [ ] Qdrant: particionado por ISP âœ“
- [ ] DuckDB: 100k linhas em <2s âœ“
- [ ] CDC: evento em <500ms âœ“
- [ ] **GATE SPRINT 1 APROVADO** â†’ AvanÃ§ar para Sprint 2 âœ“

---

## SPRINT 2 â€” MOTOR LLM + GUARDRAILS + RAG
### DuraÃ§Ã£o: 2 semanas | Blocos 1, 2, 3

---

#### SEMANA 5 (Dias 29â€“35)

**Dia 29 â€” BullMQ Production-Grade (Bloco 6)**
- [ ] Criar filas separadas por tipo: `cobranca`, `whatsapp`, `ai_processing`, `notifications`, `suspension`
- [ ] Configurar retry automÃ¡tico com backoff exponencial: 1min â†’ 5min â†’ 15min
- [ ] Implementar Dead Letter Queue (DLQ) para jobs que falharam 3x
- [ ] Configurar alertas automÃ¡ticos no Sentry quando job vai para DLQ
- [ ] Priority Queue: suspensÃµes de sinal tÃªm prioridade mÃ¡xima
- [ ] Testar: simular crash do Node.js â†’ zero mensagens perdidas
- [ ] CRITÃ‰RIO: BullMQ com DLQ e retries funcionando âœ“

**Dia 30 â€” Outbox Pattern (Bloco 6)**
- [ ] Criar migration: tabela `outbox_events (id, aggregate_id, event_type, payload, sent_at, attempts)`
- [ ] Implementar worker que lÃª outbox e envia para BullMQ em transaÃ§Ã£o atÃ´mica
- [ ] Garantir: DB atualizado E outbox gravado na mesma transaÃ§Ã£o (nunca separado)
- [ ] Simular falha de rede apÃ³s DB write â†’ job enviado igualmente quando conexÃ£o volta
- [ ] Testar 100 transaÃ§Ãµes simuladas com falha aleatÃ³ria â†’ 0 perdas
- [ ] CRITÃ‰RIO: Outbox garantindo consistÃªncia em 100% dos casos âœ“

**Dia 31 â€” Helicone FinOps (Bloco 1)**
- [ ] Criar conta Helicone e obter API key
- [ ] Configurar Helicone como proxy entre Node.js e OpenAI API
- [ ] Ativar dashboard de custo por tenant em tempo real
- [ ] Configurar alertas automÃ¡ticos se custo de ISP ultrapassar threshold definido
- [ ] Monitorar latÃªncia p95 por endpoint
- [ ] CRITÃ‰RIO: Helicone mostrando custo por ISP em tempo real âœ“

**Dia 32 â€” LLM Router (Bloco 1)**
- [ ] Criar `packages/ai/src/llm-router.ts`
- [ ] Implementar classificador de complexidade de mensagem
- [ ] Rota simples (saudaÃ§Ãµes, status) â†’ GPT-4o-mini
- [ ] Rota complexa (diagnÃ³stico tÃ©cnico, anÃ¡lise de churn, manuais) â†’ GPT-4o
- [ ] Log de cada decisÃ£o de roteamento no Helicone para auditoria
- [ ] Testar: classificar corretamente >95% das mensagens em test set de 100 queries
- [ ] CRITÃ‰RIO: LLM Router classificando >95% corretamente âœ“

**Dia 33 â€” Prompt Caching + Batch API (Bloco 1)**
- [ ] Ativar Context Caching nas system instructions dos ISPs
- [ ] Medir hit rate antes e depois no Helicone
- [ ] Implementar pipeline noturno via OpenAI Batch API para anÃ¡lise de churn
- [ ] Processar histÃ³rico de tickets para insights semanais em lote
- [ ] Validar: Prompt Cache reduzindo custo >60% em conversas longas
- [ ] CRITÃ‰RIO: Cache hit rate >60% + Batch API rodando âœ“

**Dia 34 â€” Zod Structured Outputs (Bloco 2)**
- [ ] Definir schemas Zod para TODOS os outputs da IA que afetam o banco de dados
- [ ] Implementar `generateObject` com JSON Mode em todas as extraÃ§Ãµes de dados
- [ ] Criar testes automatizados: IA com schema mal-formatado â†’ rejeitar e logar
- [ ] Garantir: nunca `JSON.parse` sem validaÃ§Ã£o Zod antes
- [ ] CRITÃ‰RIO: 0% de falha de parsing em 500 extraÃ§Ãµes de teste âœ“

**Dia 35 â€” Microsoft Presidio PII (Bloco 2)**
- [ ] Instalar ou implementar equivalente de Presidio para Node.js
- [ ] Criar `packages/ai/src/guardrails/pii-anonymizer.ts`
- [ ] Detectar e substituir: CPF, CNPJ, cartÃ£o de crÃ©dito, email, telefone â†’ `[DADO_SENSIVEL]`
- [ ] Log de cada dado anonimizado para auditoria LGPD
- [ ] Implementar ANTES de cada chamada Ã  OpenAI (middleware obrigatÃ³rio)
- [ ] Testar: 1000 mensagens com PII â†’ 0 CPFs chegam Ã  OpenAI
- [ ] CRITÃ‰RIO: Presidio detectando >99% de PII âœ“

---

#### SEMANA 6 (Dias 36â€“42)

**Dia 36 â€” Prompt Injection Deflector (Bloco 2)**
- [ ] Criar `packages/ai/src/guardrails/injection-deflector.ts`
- [ ] Implementar modelo leve de classificaÃ§Ã£o de jailbreak (regras + LLM pequeno)
- [ ] Configurar threshold de score para bloqueio (configurÃ¡vel por ISP)
- [ ] Log de mensagens bloqueadas no Sentry com payload anonimizado
- [ ] Testar: 20 tentativas de jailbreak conhecidas â†’ 100% bloqueadas
- [ ] CRITÃ‰RIO: Prompt Injection Deflector bloqueando 100% dos jailbreaks de teste âœ“

**Dia 37 â€” Chain of Thought + Few-Shot DinÃ¢mico (Bloco 2)**
- [ ] Implementar CoT em todos os prompts de diagnÃ³stico tÃ©cnico e financeiro
- [ ] Criar pipeline de Few-Shot: Qdrant busca 3 tickets resolvidos similares â†’ injeta no prompt
- [ ] Executar teste A/B: resposta com CoT vs sem CoT em 100 perguntas tÃ©cnicas
- [ ] Documentar templates de prompts por domÃ­nio (suporte, cobranÃ§a, onboarding)
- [ ] CRITÃ‰RIO: CoT melhorando precisÃ£o nas extraÃ§Ãµes âœ“

**Dia 38 â€” Qdrant Pipeline de IngestÃ£o (Bloco 3)**
- [ ] Criar `packages/ai/src/rag/ingestion-pipeline.ts`
- [ ] Implementar Semantic Chunking com anÃ¡lise de parÃ¡grafos (nÃ£o corte por palavras)
- [ ] Implementar Overlap de 20% entre chunks para preservar contexto
- [ ] Gerar embeddings via `text-embedding-3-small` â†’ vetores no Qdrant com payload ISP_ID
- [ ] Criar UI no painel para upload de PDF/DOCX/TXT pelo gestor do ISP
- [ ] Testar: PDF de 100 pÃ¡ginas ingerido em <30 segundos
- [ ] CRITÃ‰RIO: Pipeline de ingestÃ£o funcionando âœ“

**Dia 39 â€” Hybrid Search BM25 + SemÃ¢ntico (Bloco 3)**
- [ ] Implementar busca semÃ¢ntica via Qdrant para contexto e significado
- [ ] Implementar BM25 para termos tÃ©cnicos exatos (IPs, modelos de equipamento)
- [ ] Configurar score fusion: 60% semÃ¢ntico + 40% BM25
- [ ] Filtro obrigatÃ³rio por ISP_ID em TODAS as buscas (isolamento garantido)
- [ ] Testar: precisÃ£o >85% em 50 queries tÃ©cnicas reais de ISP
- [ ] CRITÃ‰RIO: Hybrid Search com >85% de precisÃ£o âœ“

**Dia 40 â€” HyDE para Queries Vagas (Bloco 3)**
- [ ] Criar `packages/ai/src/rag/hyde.service.ts`
- [ ] Implementar: query vaga â†’ IA gera laudo hipotÃ©tico â†’ laudo vira query de busca
- [ ] Comparar precisÃ£o: HyDE vs busca direta em 100 queries vagas
- [ ] Integrar HyDE no pipeline RAG principal
- [ ] CRITÃ‰RIO: HyDE melhorando recall >30% em queries vagas âœ“

**Dia 41 â€” Zep/Mem0 MemÃ³ria de Longo Prazo (Bloco 3)**
- [ ] Instalar Zep Cloud ou self-hosted
- [ ] Configurar Zep como camada sobre o Qdrant
- [ ] Implementar resumo automÃ¡tico de conversas antigas por cliente
- [ ] Extrair entidades automaticamente: plano atual, histÃ³rico de problemas, equipamentos
- [ ] Injetar contexto relevante em cada nova conversa automaticamente
- [ ] Testar: Zep recuperando contexto de conversa de 3 meses em <500ms
- [ ] CRITÃ‰RIO: MemÃ³ria de longo prazo funcionando âœ“

**Dia 42 â€” Definition of Done Sprint 2**
- [ ] BullMQ DLQ: capturando falhas e alertando em <1 min âœ“
- [ ] Outbox: 100 transaÃ§Ãµes com falha â†’ 0 perdas âœ“
- [ ] Helicone: custo por ISP em tempo real âœ“
- [ ] LLM Router: >95% de classificaÃ§Ã£o correta âœ“
- [ ] Prompt Cache: >60% de reduÃ§Ã£o de custo âœ“
- [ ] Presidio: 0 CPFs chegando Ã  OpenAI âœ“
- [ ] Injection Deflector: 100% dos jailbreaks bloqueados âœ“
- [ ] IngestÃ£o PDF: 100 pÃ¡ginas em <30s âœ“
- [ ] Hybrid Search: >85% de precisÃ£o âœ“
- [ ] HyDE: +30% de recall âœ“
- [ ] Zep: contexto em <500ms âœ“
- [ ] **GATE SPRINT 2 APROVADO** â†’ AvanÃ§ar para Sprint 3 âœ“
# ASTRUM â€” PLANO DE EXECUÃ‡ÃƒO â€” PARTE 3
## Sprint 3 a Sprint 6 (Semanas 7â€“14)

---

## SPRINT 3 â€” AGENTES + OBSERVABILIDADE + DEVOPS
### DuraÃ§Ã£o: 2 semanas | Blocos 4, 10, 11

---

#### SEMANA 7 (Dias 43â€“49)

**Dia 43 â€” LangGraph State Machines (Bloco 4)**
- [ ] Instalar `@langchain/langgraph`
- [ ] Criar `packages/ai/src/agents/support-flow.graph.ts`
- [ ] Implementar Fluxo de Suporte: Triagem â†’ DiagnÃ³stico â†’ SoluÃ§Ã£o â†’ Escalonamento
- [ ] Regra inegociÃ¡vel: NENHUM agente avanÃ§a sem validar o nÃ³ anterior
- [ ] Implementar nÃ³s: `classifyIssue`, `searchKnowledgeBase`, `generateSolution`, `escalate`
- [ ] Testar: 100 execuÃ§Ãµes â†’ nunca pula nÃ³ de validaÃ§Ã£o
- [ ] CRITÃ‰RIO: LangGraph Suporte funcionando deterministicamente âœ“

**Dia 44 â€” LangGraph CobrAI Flow (Bloco 4)**
- [ ] Criar `packages/ai/src/agents/cobrai-flow.graph.ts`
- [ ] Implementar Fluxo CobrAI: Aviso (D+1) â†’ NegociaÃ§Ã£o (D+3) â†’ SuspensÃ£o (D+5) â†’ ReativaÃ§Ã£o
- [ ] Implementar nÃ³s: `sendWarning`, `negotiatePayment`, `suspendSignal`, `reactivateSignal`
- [ ] Integrar com BullMQ: cada etapa Ã© um job com delay configurÃ¡vel por ISP
- [ ] Cancelamento de job se cliente pagar antes do prÃ³ximo disparo
- [ ] Testar fluxo completo end-to-end com ISP de teste
- [ ] CRITÃ‰RIO: CobrAI executando rÃ©gua de 5 etapas sem falha âœ“

**Dia 45 â€” LangGraph Onboarding Flow + Agentic RAG (Bloco 4)**
- [ ] Criar `packages/ai/src/agents/onboarding-flow.graph.ts`
- [ ] Implementar: Boas-vindas â†’ Coleta de dados â†’ AtivaÃ§Ã£o â†’ ConfiguraÃ§Ã£o do sistema
- [ ] Implementar Agentic RAG: agente decide Supabase (dados) vs Qdrant (manuais)
- [ ] Log de cada decisÃ£o de roteamento RAG para otimizaÃ§Ã£o futura
- [ ] CRITÃ‰RIO: Onboarding automatizado funcionando âœ“

**Dia 46 â€” BullMQ Durable Workflows (Bloco 4)**
- [ ] Implementar workflow: "Vou pagar amanhÃ£" â†’ job com delay de 24h no BullMQ
- [ ] Implementar: "Ligue em 3 dias" â†’ delay de 72h com cancelamento se pagar antes
- [ ] Teste de resiliÃªncia: servidor reinicia durante espera â†’ job continua no horÃ¡rio correto
- [ ] Validar HMAC em todos os webhooks que ativam agentes
- [ ] CRITÃ‰RIO: Durable workflows sobrevivendo a crash do servidor âœ“

**Dia 47 â€” Docker Multi-stage + GitHub Container Registry (Bloco 10)**
- [ ] Criar `Dockerfile` multi-stage para `apps/api`
- [ ] Criar `Dockerfile` multi-stage para `apps/web`
- [ ] Build de produÃ§Ã£o: imagem final <100MB (sem cÃ³digo-fonte, sem secrets)
- [ ] Configurar GitHub Container Registry como registry privado
- [ ] Configurar health checks no container
- [ ] Criar `docker-compose.yml` para desenvolvimento local completo
- [ ] CRITÃ‰RIO: Imagem Docker <100MB sem secrets âœ“

**Dia 48 â€” GitHub Actions CI/CD Pipeline (Bloco 10)**
- [ ] Criar `.github/workflows/ci.yml`: Lint â†’ Vitest â†’ Playwright â†’ Build â†’ Deploy
- [ ] Configurar TurboRepo Remote Caching no pipeline
- [ ] ProteÃ§Ã£o: deploy para produÃ§Ã£o somente apÃ³s todos os tests passarem
- [ ] Configurar secret scanning automÃ¡tico (grep por API keys no CI)
- [ ] CRITÃ‰RIO: Pipeline completo rodando em todo PR âœ“

**Dia 49 â€” Ephemeral Environments + PaaS (Bloco 10)**
- [ ] Configurar Render/DigitalOcean App Platform (ou Fly.io)
- [ ] Implementar Ephemeral Environments: cada PR abre preview isolado
- [ ] Configurar Graceful Shutdown no PaaS
- [ ] Zero-downtime deploy com Health Probe antes de trocar container
- [ ] Testar: `git push` â†’ deploy automÃ¡tico em <5 minutos
- [ ] CRITÃ‰RIO: Deploy em <5 minutos com zero downtime âœ“

---

#### SEMANA 8 (Dias 50â€“56)

**Dia 50 â€” Pulumi IaC + Renovate (Bloco 10)**
- [ ] Instalar Pulumi CLI
- [ ] Criar `infra/index.ts` declarando toda a infraestrutura em TypeScript
- [ ] Declarar: Supabase project, Redis instance, R2 buckets, Qdrant instance
- [ ] Configurar Renovate: PRs automÃ¡ticos para atualizaÃ§Ã£o de dependÃªncias
- [ ] Configurar alertas de seguranÃ§a (Dependabot) integrados ao Slack/Discord
- [ ] CRITÃ‰RIO: Toda infraestrutura declarada como cÃ³digo âœ“

**Dia 51 â€” Sentry Error Tracking (Bloco 11)**
- [ ] Configurar Sentry em staging E produÃ§Ã£o com Source Maps do TypeScript
- [ ] Ativar Sentry Profiling: identificar funÃ§Ãµes que consomem mais CPU
- [ ] Configurar alertas para Slack em erros novos ou spike de erros existentes
- [ ] Configurar Performance Monitoring: rastrear endpoints lentos
- [ ] Testar: provocar erro em produÃ§Ã£o â†’ alerta chega em <2 minutos
- [ ] CRITÃ‰RIO: Sentry capturando 100% dos erros âœ“

**Dia 52 â€” LangSmith Tracing (Bloco 11)**
- [ ] Criar projeto LangSmith
- [ ] Configurar `LANGCHAIN_TRACING=true` em staging e produÃ§Ã£o
- [ ] Garantir que TODA chamada Ã  OpenAI tem trace visÃ­vel no LangSmith
- [ ] Configurar tags por tenant_id para rastrear custo por ISP
- [ ] CRITÃ‰RIO: 100% das chamadas LLM rastreadas âœ“

**Dia 53 â€” RAGAS AvaliaÃ§Ã£o do RAG (Bloco 11)**
- [ ] Instalar RAGAS (Python) ou equivalente JavaScript
- [ ] Criar test set de 50 queries tÃ©cnicas reais de ISP com respostas esperadas
- [ ] Configurar RAGAS rodando diariamente no CI
- [ ] MÃ©tricas: faithfulness, answer_relevancy, context_precision
- [ ] Baseline: score â‰¥ 0.75 no test set
- [ ] CRITÃ‰RIO: RAGAS score â‰¥ 0.75 âœ“

**Dia 54 â€” LLM-as-a-Judge (Bloco 11)**
- [ ] Criar `packages/ai/src/evals/llm-judge.service.ts`
- [ ] Criar test set de 100 perguntas difÃ­ceis de suporte ISP
- [ ] Implementar avaliaÃ§Ã£o automÃ¡tica: GPT-4o avalia nova versÃ£o vs anterior
- [ ] Configurar no CI: deploy cancelado se nota cair >10% vs versÃ£o anterior
- [ ] CRITÃ‰RIO: LLM-as-a-Judge bloqueando regressÃµes âœ“

**Dia 55 â€” Vitest + Playwright E2E (Bloco 11)**
- [ ] Criar testes Vitest para toda a lÃ³gica de domÃ­nio (use cases, adapters)
- [ ] Criar testes Playwright: login â†’ emitir fatura â†’ chat IA â†’ resolver ticket
- [ ] Configurar Lighthouse CI: Performance >85, Accessibility >90
- [ ] Configurar: PR rejeitado se Lighthouse score cair
- [ ] CRITÃ‰RIO: Suite de testes completa e verde âœ“

**Dia 56 â€” Definition of Done Sprint 3**
- [ ] LangGraph: nunca pula nÃ³ de validaÃ§Ã£o em 100 execuÃ§Ãµes âœ“
- [ ] CobrAI: rÃ©gua completa de 5 etapas funcionando âœ“
- [ ] BullMQ delay 24h: testado com crash e recuperado âœ“
- [ ] Docker: imagem <100MB sem secrets âœ“
- [ ] GitHub Actions: deploy em <5 minutos âœ“
- [ ] Ephemeral environments: PR abre preview em <3 minutos âœ“
- [ ] Sentry: erro em <2 minutos de alerta âœ“
- [ ] LangSmith: 100% das chamadas rastreadas âœ“
- [ ] RAGAS: score â‰¥ 0.75 âœ“
- [ ] LLM-as-a-Judge: bloqueando regressÃµes âœ“
- [ ] Playwright: suite completa verde âœ“
- [ ] **GATE SPRINT 3 APROVADO** â†’ AvanÃ§ar para Sprint 4 âœ“

---

## SPRINT 4 â€” FRONTEND PRODUCTION-GRADE
### DuraÃ§Ã£o: 2 semanas | Bloco 8

---

#### SEMANA 9 (Dias 57â€“63)

**Dia 57 â€” React 18 + Vite + TypeScript Strict (Bloco 8)**
- [ ] Ativar TypeScript strict mode (`strict: true`) sem exceÃ§Ãµes
- [ ] Remover TODOS os `any` implÃ­citos do cÃ³digo de produÃ§Ã£o
- [ ] Configurar Vite com code splitting por rota
- [ ] Garantir bundle inicial <1MB apÃ³s code splitting
- [ ] Configurar aliases de importaÃ§Ã£o (`@/components`, `@/hooks`, etc.)
- [ ] CRITÃ‰RIO: TypeScript strict compilando sem erros âœ“

**Dia 58 â€” Zustand Estado Global (Bloco 8)**
- [ ] Refatorar `src/store/useAppStore.ts` para separar por domÃ­nio
- [ ] Criar stores separadas: `useAuthStore`, `useChatStore`, `useTicketStore`, `useBillingStore`
- [ ] Implementar persistÃªncia seletiva com `zustand/middleware/persist`
- [ ] Garantir: mudanÃ§a em um store nÃ£o causa re-render em componentes de outro store
- [ ] CRITÃ‰RIO: Zero re-renders desnecessÃ¡rios na troca de estado âœ“

**Dia 59 â€” TanStack Query Data Fetching (Bloco 8)**
- [ ] Auditar todos os `useEffect` de fetch e migrar para TanStack Query
- [ ] Implementar Stale-While-Revalidate: dados mostrados instantaneamente
- [ ] Configurar invalidaÃ§Ã£o de cache automÃ¡tica via CDC do Supabase
- [ ] Testar: navegar Faturas â†’ Tickets â†’ Faturas sem nova chamada API
- [ ] CRITÃ‰RIO: Cache de dados funcionando sem polling desnecessÃ¡rio âœ“

**Dia 60 â€” Design System Shadcn/UI + Tailwind (Bloco 8)**
- [ ] Auditar componentes Shadcn jÃ¡ existentes no projeto
- [ ] Customizar tokens de design da Astrum: cores, tipografia, espaÃ§amentos
- [ ] Garantir consistÃªncia visual em todos os mÃ³dulos: CRM, Billing, Chat, Dashboard
- [ ] Revisar e corrigir acessibilidade (ARIA labels, foco, contraste)
- [ ] CRITÃ‰RIO: Design system consistente em toda a aplicaÃ§Ã£o âœ“

**Dia 61 â€” Framer Motion AnimaÃ§Ãµes (Bloco 8)**
- [ ] Implementar Framer Motion em 3 pontos crÃ­ticos de UX:
  1. Abertura/fechamento de modais (spring animation)
  2. TransiÃ§Ãµes entre pÃ¡ginas (fade + slide)
  3. Loading states do chat (pulsaÃ§Ã£o da IA pensando)
- [ ] Garantir animaÃ§Ãµes em 60fps sem jank
- [ ] CRITÃ‰RIO: AnimaÃ§Ãµes suaves em 60fps âœ“

**Dia 62 â€” Optimistic UI + Skeletal Loading (Bloco 8)**
- [ ] Implementar Optimistic UI em TODAS as aÃ§Ãµes crÃ­ticas:
  - Envio de mensagem no chat
  - AtualizaÃ§Ã£o de ticket
  - EmissÃ£o de boleto
- [ ] Substituir spinners por Skeletal Loading em TODAS as listagens
- [ ] Implementar Font Subset: apenas caracteres PT-BR carregados
- [ ] CRITÃ‰RIO: UX de resposta instantÃ¢nea em todas as aÃ§Ãµes âœ“

**Dia 63 â€” WebSockets + SSE no Frontend (Bloco 8)**
- [ ] Integrar WebSockets: mensagens chegam sem polling
- [ ] Implementar SSE streaming: tokens da IA aparecem letra-a-letra
- [ ] Implementar Abort Controller no chat: usuÃ¡rio cancela resposta
- [ ] ReconexÃ£o automÃ¡tica de WebSocket com backoff exponencial
- [ ] CRITÃ‰RIO: Chat em tempo real funcionando âœ“

---

#### SEMANA 10 (Dias 64â€“70)

**Dia 64 â€” Lighthouse CI + Performance (Bloco 8)**
- [ ] Executar Lighthouse em todas as pÃ¡ginas principais
- [ ] Corrigir issues de Performance, Accessibility, Best Practices
- [ ] Atingir: Performance >90, Accessibility >90, Best Practices >90
- [ ] Time to Interactive <2 segundos em conexÃ£o 4G simulada
- [ ] Configurar Lighthouse CI como gate no GitHub Actions
- [ ] CRITÃ‰RIO: Lighthouse Score >90 em todas as mÃ©tricas âœ“

**Dia 65 â€” MÃ³dulo de Dashboard Principal**
- [ ] Implementar cards de KPIs: tickets abertos, resoluÃ§Ã£o IA, custo IA, inadimplÃªncia
- [ ] GrÃ¡ficos Recharts: sÃ©rie temporal de atendimentos, churn mensal
- [ ] IntegraÃ§Ã£o com DuckDB: relatÃ³rios pesados sem bloquear chat
- [ ] Filtros por perÃ­odo e por ISP (para super admin)
- [ ] CRITÃ‰RIO: Dashboard com dados reais carregando âœ“

**Dia 66 â€” MÃ³dulo AstroChat UI**
- [ ] Interface completa do chat WhatsApp no painel
- [ ] Lista de conversas com busca e filtros
- [ ] Painel de conversa com histÃ³rico, SSE streaming, aÃ§Ãµes rÃ¡pidas
- [ ] Indicadores: "IA respondendo...", "Aguardando humano", "Resolvido"
- [ ] IntegraÃ§Ã£o com LangGraph flows (visÃ­vel no painel qual nÃ³ estÃ¡ ativo)
- [ ] CRITÃ‰RIO: AstroChat UI completa e funcional âœ“

**Dia 67 â€” MÃ³dulo CobrAI UI**
- [ ] Dashboard de inadimplÃªncia: lista de devedores, estÃ¡gio da rÃ©gua, dias em atraso
- [ ] BotÃµes de aÃ§Ã£o: avanÃ§ar etapa, pausar cobranÃ§a, registrar pagamento
- [ ] HistÃ³rico da rÃ©gua por cliente (cada disparo registrado)
- [ ] Indicador de jobs pendentes no BullMQ
- [ ] CRITÃ‰RIO: CobrAI UI operacional âœ“

**Dia 68 â€” MÃ³dulo de Tickets + Faturamento**
- [ ] Lista de tickets com filtros por status, prioridade, tÃ©cnico, ISP
- [ ] Detalhe do ticket com histÃ³rico, aÃ§Ãµes, escalaÃ§Ã£o
- [ ] MÃ³dulo de faturamento: emissÃ£o, histÃ³rico, status de pagamento
- [ ] IntegraÃ§Ã£o com Optimistic UI em todas as aÃ§Ãµes
- [ ] CRITÃ‰RIO: Tickets e Faturamento funcionando âœ“

**Dia 69 â€” MÃ³dulo de ConfiguraÃ§Ãµes + Onboarding ISP**
- [ ] Painel de configuraÃ§Ãµes por ISP: personalidade da IA, regras de cobranÃ§a, planos
- [ ] Upload de manuais tÃ©cnicos (PDF/DOCX) com barra de progresso
- [ ] VisualizaÃ§Ã£o do status de ingestÃ£o no Qdrant
- [ ] Fluxo de onboarding guiado para novo ISP
- [ ] CRITÃ‰RIO: ConfiguraÃ§Ãµes e onboarding completos âœ“

**Dia 70 â€” Definition of Done Sprint 4**
- [ ] TypeScript strict: zero errors âœ“
- [ ] Lighthouse >90 em todas as pÃ¡ginas âœ“
- [ ] TanStack: sem polling desnecessÃ¡rio âœ“
- [ ] WebSocket + SSE: chat em tempo real âœ“
- [ ] Optimistic UI: aÃ§Ãµes instantÃ¢neas âœ“
- [ ] Skeleton Loading: zero spinners âœ“
- [ ] AstroChat UI completa âœ“
- [ ] CobrAI UI operacional âœ“
- [ ] Tickets + Faturamento funcionando âœ“
- [ ] **GATE SPRINT 4 APROVADO** â†’ AvanÃ§ar para Sprint 5 âœ“
# ASTRUM â€” PLANO DE EXECUÃ‡ÃƒO â€” PARTE 4
## Sprint 5 a Sprint 7 + ConsolidaÃ§Ã£o Final (Semanas 11â€“18+)

---

## SPRINT 5 â€” INTEGRAÃ‡ÃƒO END-TO-END + WHATSAPP
### DuraÃ§Ã£o: 2 semanas | IntegraÃ§Ã£o de todos os Blocos

---

#### SEMANA 11 (Dias 71â€“77)

**Dia 71 â€” IntegraÃ§Ã£o WhatsApp/Evolution API**
- [ ] Auditar integraÃ§Ã£o Evolution API existente no projeto
- [ ] Garantir HMAC em todos os webhooks recebidos da Evolution API
- [ ] Implementar fluxo completo: WhatsApp â†’ Presidio â†’ LangGraph â†’ Qdrant â†’ LLM â†’ Resposta
- [ ] Testar com nÃºmero de WhatsApp real: enviar mensagem â†’ receber resposta em <3s
- [ ] CRITÃ‰RIO: Fluxo WhatsApp end-to-end funcionando âœ“

**Dia 72 â€” IntegraÃ§Ã£o Sistemas ISP (IXC/SGP/MK-Auth)**
- [ ] Auditar integraÃ§Ã£o com sistemas ISP existentes no projeto
- [ ] Implementar Strangler Fig: Astrum assume apenas o suporte via WhatsApp primeiro
- [ ] Webhooks HMAC para callbacks dos sistemas ISP
- [ ] Testar com ISP de teste: consultar plano â†’ verificar sinal â†’ suspender
- [ ] CRITÃ‰RIO: IntegraÃ§Ã£o ISP funcionando via Strangler Fig âœ“

**Dia 73 â€” Fluxo CobrAI End-to-End**
- [ ] Testar rÃ©gua completa com ISP real: aviso â†’ negociaÃ§Ã£o â†’ suspensÃ£o â†’ reativaÃ§Ã£o
- [ ] Validar cada job no BullMQ com timestamps corretos
- [ ] Confirmar zero jobs perdidos em caso de crash
- [ ] Medir taxa de auto-resoluÃ§Ã£o da cobranÃ§a
- [ ] CRITÃ‰RIO: CobrAI end-to-end com 0% de jobs perdidos âœ“

**Dia 74 â€” Onboarding Automatizado de ISP**
- [ ] Implementar fluxo completo: ISP cria conta â†’ sistema provisiona tenant em <5 minutos
- [ ] Provisionamento automÃ¡tico: banco Supabase, coleÃ§Ã£o Qdrant, bucket R2, config BullMQ
- [ ] Email de boas-vindas automÃ¡tico com credenciais
- [ ] Wizard de configuraÃ§Ã£o guiado no painel
- [ ] CRITÃ‰RIO: ISP novo provisionado em <5 minutos âœ“

**Dia 75 â€” Load Test 1000 Mensagens SimultÃ¢neas**
- [ ] Instalar K6 para load testing
- [ ] Criar script K6: 1000 mensagens de WhatsApp simultÃ¢neas
- [ ] Simular pico: queda de fibra numa cidade â†’ todos os clientes reclamam ao mesmo tempo
- [ ] Identificar gargalos e corrigir
- [ ] Meta: sistema aguentar 1000 req/s sem degradaÃ§Ã£o >200ms
- [ ] CRITÃ‰RIO: Load test aprovado âœ“

**Dia 76 â€” Chaos Testing: Queda da OpenAI**
- [ ] Simular queda da OpenAI via Circuit Breaker
- [ ] Verificar: AstroChat responde com fallback em <500ms
- [ ] Simular queda do Qdrant: sistema degrada graciosamente (sem crash)
- [ ] Simular queda do Redis: BullMQ cai â†’ reinicia sozinho quando Redis volta
- [ ] CRITÃ‰RIO: Sistema resiliente a quedas de serviÃ§os externos âœ“

**Dia 77 â€” Security Audit Completo**
- [ ] Executar penetration test em todas as rotas crÃ­ticas
- [ ] Verificar: todas as rotas financeiras tÃªm Idempotency Key
- [ ] Verificar: todos os webhooks tÃªm HMAC
- [ ] Verificar: zero secrets no repositÃ³rio (CI passando)
- [ ] Verificar: RLS impedindo cross-tenant em 100% dos cenÃ¡rios
- [ ] Revisar CSP headers em todas as pÃ¡ginas
- [ ] CRITÃ‰RIO: Security audit aprovado âœ“

---

#### SEMANA 12 (Dias 78â€“84)

**Dia 78 â€” Dashboard de SaÃºde por ISP**
- [ ] Implementar: custo de IA, tickets resolvidos, taxa de resoluÃ§Ã£o por ISP
- [ ] GrÃ¡fico de inadimplÃªncia: evoluÃ§Ã£o diÃ¡ria, semanal, mensal
- [ ] Alertas automÃ¡ticos: ISP com custo IA acima do threshold
- [ ] ExportaÃ§Ã£o de relatÃ³rio em PDF/Excel via DuckDB
- [ ] CRITÃ‰RIO: Dashboard de saÃºde completo âœ“

**Dia 79 â€” DocumentaÃ§Ã£o TÃ©cnica Completa**
- [ ] Documentar arquitetura DDD + Hexagonal com diagramas
- [ ] Documentar todos os fluxos LangGraph (State Machines) com diagramas
- [ ] Documentar API REST completa (Swagger/OpenAPI)
- [ ] Criar guia de onboarding para novos desenvolvedores
- [ ] Criar runbook de incidentes (o que fazer quando X falha)
- [ ] CRITÃ‰RIO: DocumentaÃ§Ã£o completa e revisada âœ“

**Dia 80 â€” Ajuste Fino do LLM Router**
- [ ] Analisar dados reais de produÃ§Ã£o do Helicone
- [ ] Calibrar threshold de complexidade do LLM Router
- [ ] Medir custo por mensagem antes e depois da calibraÃ§Ã£o
- [ ] Documentar economia gerada pelo router
- [ ] CRITÃ‰RIO: Router otimizado com dados reais âœ“

**Dia 81 â€” RAGAS ContÃ­nuo + LLM-as-a-Judge Calibrado**
- [ ] Analisar scores RAGAS com dados reais de produÃ§Ã£o
- [ ] Ajustar pipeline de chunking se precisÃ£o <0.85
- [ ] Calibrar LLM-as-a-Judge com perguntas reais de ISP
- [ ] Expandir test set para 200 perguntas
- [ ] CRITÃ‰RIO: RAGAS score >0.80 com dados reais âœ“

**Dia 82 â€” Synthetic Monitoring (MonitorizaÃ§Ã£o SintÃ©tica)**
- [ ] Implementar robÃ´ que a cada hora simula um cliente real:
  - Abre sessÃ£o no AstroChat
  - Envia mensagem de suporte
  - Verifica se IA respondeu corretamente
  - Abre ticket
  - Simula pagamento
- [ ] Alertar equipe se qualquer etapa falhar
- [ ] CRITÃ‰RIO: Synthetic monitoring rodando 24/7 âœ“

**Dia 83 â€” OptimizaÃ§Ã£o de Performance Final**
- [ ] Analisar Sentry Profiling: quais funÃ§Ãµes consomem mais CPU
- [ ] Otimizar as 3 funÃ§Ãµes mais lentas identificadas
- [ ] Re-executar benchmark Fastify: confirmar >10k req/s
- [ ] Re-executar Lighthouse: confirmar >90 em todas as pÃ¡ginas
- [ ] CRITÃ‰RIO: Performance mantida apÃ³s todas as features âœ“

**Dia 84 â€” Definition of Done Sprint 5 (PRÃ‰-GO-LIVE)**
- [ ] Fluxo WhatsApp end-to-end: <3s de resposta âœ“
- [ ] CobrAI: 0% de jobs perdidos âœ“
- [ ] Onboarding: ISP novo em <5 minutos âœ“
- [ ] Load test: 1000 mensagens simultÃ¢neas sem degradaÃ§Ã£o âœ“
- [ ] Chaos test: OpenAI cai â†’ fallback <500ms âœ“
- [ ] Security audit aprovado âœ“
- [ ] RAGAS >0.80 com dados reais âœ“
- [ ] Synthetic monitoring rodando âœ“
- [ ] **ðŸŽ‰ ASTRUM AI ENGINE COMPLETO â€” GO-LIVE AUTORIZADO âœ“**

---

## SPRINT 6 â€” ESCALA E MULTI-TENANT AVANÃ‡ADO
### DuraÃ§Ã£o: 2 semanas | OtimizaÃ§Ãµes pÃ³s-lanÃ§amento

---

#### SEMANA 13 (Dias 85â€“91)

**Dia 85 â€” Multi-tenant Scale Testing**
- [ ] Testar com 10 ISPs simultÃ¢neos na plataforma
- [ ] Verificar isolamento de dados entre todos os 10 ISPs
- [ ] Medir performance do Qdrant com 10 coleÃ§Ãµes ativas
- [ ] Monitorar custo por ISP no Helicone com dados reais
- [ ] CRITÃ‰RIO: 10 ISPs rodando em paralelo sem interferÃªncia âœ“

**Dia 86 â€” Feature Flags System**
- [ ] Auditar `src/lib/featureFlags.ts` existente
- [ ] Implementar feature flags por tenant (ISP ativa/desativa funcionalidades)
- [ ] Flags: CobrAI automÃ¡tico, escalaÃ§Ã£o para humano, relatÃ³rios avanÃ§ados
- [ ] Painel de controle de feature flags no super admin
- [ ] CRITÃ‰RIO: Feature flags por ISP funcionando âœ“

**Dia 87 â€” Gamification Engine**
- [ ] Auditar `src/workers/gamificationWorker.ts` existente
- [ ] Integrar gamification com novos flows do LangGraph
- [ ] PontuaÃ§Ã£o por tickets resolvidos, velocidade de atendimento, satisfaÃ§Ã£o do cliente
- [ ] Dashboard de gamification para tÃ©cnicos
- [ ] CRITÃ‰RIO: Gamification integrado com novos flows âœ“

**Dia 88 â€” SLA Engine Aprimorado**
- [ ] Auditar `src/workers/slaWorker.ts` existente
- [ ] Integrar SLA com escalaÃ§Ã£o automÃ¡tica do LangGraph
- [ ] Alertas automÃ¡ticos antes de SLA vencer
- [ ] Dashboard de SLA por ISP e por tÃ©cnico
- [ ] CRITÃ‰RIO: SLA engine integrado ao LangGraph âœ“

**Dia 89 â€” Upsell Engine IA**
- [ ] Auditar `src/lib/upsellEngine.ts` existente
- [ ] Integrar com anÃ¡lise de churn do RAG
- [ ] IA sugere upgrade de plano em momento oportuno na conversa
- [ ] Log de todas as sugestÃµes e conversÃµes no Helicone
- [ ] CRITÃ‰RIO: Upsell Engine integrado com IA âœ“

**Dia 90 â€” Site Scrape Worker Atualizado**
- [ ] Auditar `src/workers/siteScrapeWorker.ts` existente
- [ ] Integrar com pipeline de ingestÃ£o RAG do Qdrant
- [ ] Sites scrapados â†’ chunked â†’ embedded â†’ indexados automaticamente
- [ ] Schedule automÃ¡tico de atualizaÃ§Ã£o
- [ ] CRITÃ‰RIO: Scrape Worker alimentando RAG automaticamente âœ“

**Dia 91 â€” RevisÃ£o Semana 13**
- [ ] Executar todos os testes automatizados (Vitest + Playwright)
- [ ] Verificar RAGAS score ainda â‰¥ 0.80
- [ ] Verificar Lighthouse ainda >90
- [ ] Analisar Helicone: custo por ISP dentro do esperado
- [ ] CRITÃ‰RIO: Semana 13 concluÃ­da sem regressÃµes âœ“

---

#### SEMANA 14 (Dias 92â€“98)

**Dia 92 â€” Vision Processor (AnÃ¡lise de Imagens)**
- [ ] Auditar `src/workers/visionProcessor.ts` existente
- [ ] Integrar GPT-4o Vision no fluxo de suporte
- [ ] UsuÃ¡rio envia foto do roteador/cabo danificado â†’ IA analisa e diagnostica
- [ ] Integrar com Qdrant: foto similares a problemas jÃ¡ resolvidos
- [ ] CRITÃ‰RIO: Vision processor integrado ao suporte âœ“

**Dia 93 â€” Escalation Engine Integrado**
- [ ] Auditar `src/lib/escalationEngine.ts` existente
- [ ] Integrar com LangGraph: nÃ³ de escalaÃ§Ã£o dispara automaticamente
- [ ] Regras de escalaÃ§Ã£o configurÃ¡veis por ISP no painel
- [ ] NotificaÃ§Ãµes push/email/WhatsApp para tÃ©cnico responsÃ¡vel
- [ ] CRITÃ‰RIO: EscalaÃ§Ã£o automÃ¡tica funcionando âœ“

**Dia 94 â€” Reports Engine Aprimorado**
- [ ] Auditar `src/workers/reportWorker.ts` existente
- [ ] Migrar relatÃ³rios pesados para DuckDB in-process
- [ ] Implementar relatÃ³rios agendados (diÃ¡rio/semanal/mensal) via BullMQ
- [ ] ExportaÃ§Ã£o PDF via jsPDF (jÃ¡ instalado)
- [ ] CRITÃ‰RIO: RelatÃ³rios rodando via DuckDB sem impactar Supabase âœ“

**Dia 95 â€” TranscriÃ§Ã£o de Ãudio (WhatsApp Voice)**
- [ ] Auditar `src/lib/transcription.ts` existente
- [ ] Integrar com Whisper API da OpenAI via Helicone (rastrear custo)
- [ ] Ãudio do WhatsApp â†’ transcrito â†’ processado pelo LangGraph
- [ ] Armazenar transcriÃ§Ãµes no Qdrant para RAG histÃ³rico
- [ ] CRITÃ‰RIO: TranscriÃ§Ã£o de Ã¡udio funcionando no fluxo âœ“

**Dia 96 â€” ERP Sync Worker**
- [ ] Auditar `src/workers/erpSyncWorker.ts` existente
- [ ] Implementar sincronizaÃ§Ã£o bidirecional com sistemas ISP (IXC/SGP)
- [ ] Outbox Pattern para garantir sincronizaÃ§Ã£o sem perda de dados
- [ ] Retry automÃ¡tico em caso de falha do sistema ISP
- [ ] CRITÃ‰RIO: ERP Sync funcionando com Outbox Pattern âœ“

**Dia 97 â€” Persona Manager + Routing Engine**
- [ ] Auditar `src/lib/personaManager.ts` e `src/lib/routingEngine.ts`
- [ ] Integrar personas configurÃ¡veis por ISP no LangGraph
- [ ] Routing engine: determina qual agente/persona atende cada tipo de problema
- [ ] Painel de configuraÃ§Ã£o de personas no admin do ISP
- [ ] CRITÃ‰RIO: Personas e routing integrados ao LangGraph âœ“

**Dia 98 â€” Definition of Done Sprint 6 + Retrospectiva Final**
- [ ] 10 ISPs em paralelo: sem interferÃªncia âœ“
- [ ] Feature flags por ISP: funcionando âœ“
- [ ] Vision, EscalaÃ§Ã£o, RelatÃ³rios, TranscriÃ§Ã£o: integrados âœ“
- [ ] ERP Sync: com Outbox Pattern âœ“
- [ ] Todas as mÃ©tricas North Star atingidas:
  - Taxa de resoluÃ§Ã£o autÃ´noma >80% âœ“
  - 0% de jobs de cobranÃ§a perdidos âœ“
  - Isolamento absoluto entre ISPs âœ“
  - Custo IA por ISP em tempo real âœ“
  - Deploy em <5 minutos com 0 downtime âœ“
  - RAGAS medido automaticamente a cada deploy âœ“
- [ ] **ðŸ† ASTRUM AI ENGINE SETORIAL â€” MISSÃƒO CONCLUÃDA âœ“**

---

## SPRINT 7+ â€” CAMINHO PARA BARE-METAL (Futuro)
### Gatilhos para Ativar (nÃ£o executar agora)

**Gatilho 1 â€” Custo OpenAI >40% do MRR:**
- Migrar para vLLM + Llama no Mac Studio / Hetzner Bare-Metal
- TEI (Text Embeddings Inference) em Docker para embeddings locais
- PagedAttention + Speculative Decoding local

**Gatilho 2 â€” BullMQ >500k jobs/dia:**
- Migrar para Redpanda ou NATS JetStream
- Apache Pulsar para event streaming massivo

**Gatilho 3 â€” DuckDB >3s nas queries:**
- Migrar para ClickHouse dedicado
- TimescaleDB para telemetria de rede

**Gatilho 4 â€” ISP exige SSO/SAML:**
- Migrar Supabase Auth para Keycloak
- Opaque Tokens substituindo JWT no frontend

**Gatilho 5 â€” Cloud Bill > Hetzner Ã— 2:**
- Migrar para K3s em servidores fÃ­sicos (Hetzner)
- ArgoCD GitOps para gerenciamento da frota
- MinIO para object storage prÃ³prio

---

## SISTEMA DE RASTREAMENTO DE PROGRESSO

### LEGENDA DE STATUS
```
[ ] = Pendente
[/] = Em progresso
[x] = ConcluÃ­do
[!] = Bloqueado / Problema
```

### SCORECARD GERAL
| Sprint | PerÃ­odo | Blocos | Status | Gates |
|--------|---------|--------|--------|-------|
| Sprint 0 | Semanas 1-2 | Bloco 12 (PadrÃµes) | [ ] | [ ] DDD + Circuit Breaker + WAL |
| Sprint 1 | Semanas 3-4 | Blocos 7 + 9 (Backend + SeguranÃ§a) | [ ] | [ ] RBAC + HMAC + RLS |
| Sprint 2 | Semanas 5-6 | Blocos 1 + 2 + 3 (LLM + Guards + RAG) | [ ] | [ ] Helicone + Presidio + RAG |
| Sprint 3 | Semanas 7-8 | Blocos 4 + 10 + 11 (Agentes + DevOps + Obs) | [ ] | [ ] LangGraph + CI/CD + Sentry |
| Sprint 4 | Semanas 9-10 | Bloco 8 (Frontend) | [ ] | [ ] Lighthouse >90 + TypeScript strict |
| Sprint 5 | Semanas 11-12 | IntegraÃ§Ã£o E2E | [ ] | [ ] Load Test + Security Audit |
| Sprint 6 | Semanas 13-14 | Escala Multi-tenant | [ ] | [ ] North Star Metrics atingidas |

### MÃ‰TRICAS NORTH STAR â€” ACOMPANHAMENTO
| MÃ©trica | Hoje | Meta | Status |
|---------|------|------|--------|
| Taxa de resoluÃ§Ã£o autÃ´noma | ~40% | >80% | [ ] |
| Custo por conversa | R$X | R$X Ã— 0.4 | [ ] |
| LatÃªncia p95 | >3s | <1.5s | [ ] |
| Cross-tenant data leak | Risco | ImpossÃ­vel (RLS) | [ ] |
| Jobs perdidos em crash | PossÃ­vel | 0 (Outbox+DLQ) | [ ] |
| Visibilidade custo por ISP | Nenhuma | Tempo real (Helicone) | [ ] |
| Deploy com downtime | Sim | 0 (Graceful Shutdown) | [ ] |
| Erros capturados antes do cliente | Raro | 100% (Sentry) | [ ] |

---

## CHECKLIST TÃ‰CNICO ZERO-FURO (MASTER)

### Infraestrutura & DevOps
- [ ] Monorepo TurboRepo: apps/web + apps/api + packages/*
- [ ] Dockerfile multi-stage testado localmente
- [ ] GitHub Actions: lint â†’ vitest â†’ playwright â†’ build â†’ deploy
- [ ] Ephemeral environments por PR
- [ ] Pulumi IaC: toda infraestrutura em cÃ³digo TypeScript
- [ ] Graceful shutdown: SIGTERM handler no Node.js
- [ ] Zero Firebase no cÃ³digo de produÃ§Ã£o
- [ ] Zero Express no cÃ³digo (100% Fastify)

### Banco de Dados & Storage
- [ ] RLS em TODAS as tabelas desde a primeira migration
- [ ] Supabase Realtime (CDC) nas tabelas crÃ­ticas
- [ ] Cloudflare R2 com zero egress
- [ ] Outbox table criada (id, payload, sent_at, attempts)
- [ ] Idempotency keys table criada
- [ ] WAL ativo e testado com crash recovery
- [ ] DuckDB in-process para analytics pesados

### IA & RAG
- [ ] Helicone mostrando custo por ISP em tempo real
- [ ] LLM Router: GPT-4o-mini para chat, GPT-4o para raciocÃ­nio
- [ ] Prompt Caching em system instructions longas
- [ ] Zod schemas em TODOS os outputs da IA
- [ ] PII anonimizado antes da OpenAI (CPF, CC â†’ [DADO_SENSIVEL])
- [ ] LangSmith tracing sempre ativo (staging + prod)
- [ ] Qdrant com particionamento por ISP (tenant_id)
- [ ] Pipeline de ingestÃ£o PDF testado (200 pÃ¡ginas sem erros)
- [ ] Hybrid Search (BM25 + SemÃ¢ntico) com score fusion
- [ ] HyDE para queries vagas
- [ ] Zep/Mem0 para memÃ³ria de longo prazo
- [ ] RAGAS score â‰¥ 0.75 no test set
- [ ] LangGraph state machines para todos os fluxos
- [ ] LLM-as-a-Judge bloqueando regressÃµes em deploy

### SeguranÃ§a
- [ ] CI job: grep no repositÃ³rio = zero API keys
- [ ] JWT rotation: 15 minutos no Supabase Auth
- [ ] RBAC: TÃ©cnico / Gestor / Admin testados
- [ ] HMAC em todos os webhooks (WhatsApp, Stripe, ISP)
- [ ] Circuit Breaker em OpenAI, WhatsApp, pagamentos
- [ ] Rate limiting (Token Bucket) em todas as rotas
- [ ] Argon2id para todas as senhas de usuÃ¡rios
- [ ] VPC: Supabase + Redis sem acesso pÃºblico

### Qualidade & Observabilidade
- [ ] Sentry em staging E produÃ§Ã£o com source maps
- [ ] Pino.js: zero console.log no cÃ³digo de produÃ§Ã£o
- [ ] Playwright E2E: login â†’ fatura â†’ chat â†’ ticket
- [ ] Lighthouse CI: Performance >85, A11y >90
- [ ] LLM-as-a-Judge automatizado em cada deploy de prompts
- [ ] Synthetic monitoring rodando 24/7

---

*Plano gerado em: 2026-05-30 | VersÃ£o 1.0*
*Baseado nos 12 Blocos TecnolÃ³gicos + ASTRUM_AI_ENGINE_ROADMAP.md + anÃ¡lise do cÃ³digo-fonte existente*
*Total: ~14 semanas de execuÃ§Ã£o | ~98 dias de trabalho*
