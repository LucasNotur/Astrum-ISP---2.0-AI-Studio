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
- [~] Pipeline de ingestão PDF testado (200 páginas) — PARCIAL 2026-08-27,
  código 100% validado, só falta crédito real pra ver o `✅ PASSOU` fim-a-fim.
  Criado `scripts/qa/pdf-ingestion-smoke.ts` (gera PDF sintético de 200
  páginas em memória, sem dependência nova, roda extração+chunking+embeddings
  +Qdrant reais contra um tenant de teste isolado, sempre limpa a coleção
  Qdrant no fim).
  - **Extração + chunking:** validados sem erro (pdf-parse, 419k chars, ~1s).
    **Bug real achado e corrigido:** `chunkTechnicalManual` tratava qualquer
    linha "1. " "2. " como nova seção — texto extraído de PDF quase nunca tem
    heading markdown, e manuais de ISP são cheios de passo-a-passo numerado,
    então o documento de 200 páginas virava 3601 chunks de ~116 chars (achado,
    não 320 chunks de ~1461 chars como deveria) — retrieval RAG praticamente
    inútil e ~18x mais chamadas de embedding do que necessário. Corrigido
    (removido o padrão numerado do split; cai no fallback `chunkDocument`, que
    já respeita tamanho-alvo), teste de regressão em
    `document-chunker.service.test.ts`.
  - **Embeddings com failover:** achado no caminho — a chave OpenAI local
    sem crédito nunca caía pro Gemini apesar do router de failover multi-
    provider já existir (`model-router.ts`), porque embeddings nunca foram
    ligados nele (caminho de código 100% separado, só chat usava). Implementada
    Fase 1 (fan-out de embeddings por provider, ver
    `HANDOFF_RAG_EMBEDDING_FAILOVER_FASE1.md`): `generateEmbeddingsBatchWithFailover`
    tenta OpenAI, cai pro Gemini se falhar; coleção Qdrant separada por
    provider (`tenant_X` = openai, sem migração; `tenant_X_google` = novo);
    migration 124 (`embedding_provider` em `knowledge_documents`/
    `knowledge_articles`). Rodando o smoke test com o failover: **confirmado
    funcionando** — OpenAI recusou (`credit_balance_exhausted`), caiu pro
    Gemini automaticamente, Gemini TAMBÉM recusou (`RESOURCE_EXHAUSTED`, free
    tier estourado pela rajada de 320 textos) — comportamento correto e
    esperado quando os dois provedores estão sem fôlego (propaga o erro, não
    silencia). Fase 2 (fan-out também na LEITURA/busca, 3+ call sites
    duplicados no repo) documentada mas não iniciada.
  - **Achado colateral sério rodando isso:** o backend de produção estava
    fora do ar havia 5h+ (desde 10:51 UTC) sem ninguém perceber — causa real:
    `REDIS_URL` usa `localhost`, que nesta máquina Windows resolve pra IPv6
    (`::1`) antes de IPv4, mas o Docker só expõe o Redis em `127.0.0.1`;
    `ioredis` não tem fallback entre IPv4/IPv6 (diferente do `fetch()` do
    Qdrant) e travava em `ETIMEDOUT` pra sempre. Corrigido: `.env` (fix
    imediato) + `family: 4` forçado em `redis.client.ts` (fix definitivo, não
    depende de ninguém lembrar de usar `127.0.0.1` no futuro). Produção
    confirmada de volta no ar. Ver `astrum-redis-etimedout-boot` na memória.
  - **Bloqueado (external, não é código):** OpenAI sem crédito + Gemini com
    quota free-tier estourada ao mesmo tempo. *Ação do Lucas:* crédito em
    qualquer um dos dois resolve; depois `npx tsx -r dotenv/config
    scripts/qa/pdf-ingestion-smoke.ts` valida o pipeline inteiro em ~1-2 min.
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
- [x] VPC: Supabase + Redis sem acesso público direto — VERIFICADO 2026-08-27.
  **Redis/Qdrant:** já corretos por construção, conferido no binding de porta
  AO VIVO (`docker port astrum-redis`/`astrum-qdrant`), não só no arquivo:
  `127.0.0.1:6379`/`127.0.0.1:6333-6334` (só loopback), Redis com
  `requirepass` obrigatório. Em produção (`docker-compose.yml`) nem chega a
  publicar porta pro host — fica isolado numa rede Docker `internal: true`
  (sem rota pra internet), só acessível entre containers. O túnel Cloudflare
  (`~/.cloudflared/config.yml`) só expõe `api.astrumlabs.online` →
  `localhost:3001`, nada mais é tunelado. **Supabase:** é cloud gerenciado,
  não um "VPC" no sentido tradicional — a API REST fica pública por design
  (RLS já é a barreira real, extensivamente auditada em sessões anteriores —
  ver `astrum-anon-client-fix` na memória). O único ponto de acesso direto ao
  Postgres é o pooler Supavisor (`tenant-rls.ts`, RLS por-tenant). **Decisão
  do Lucas 2026-08-27:** não configurar Network Restrictions (allowlist de
  IP) — IP público de casa (`138.84.56.249` no momento) é residencial/
  dinâmico, restringir por IP arriscaria quebrar a conexão direta em
  produção silenciosamente se o IP mudar (mesma classe de incidente do
  outage de Redis desta sessão). Reavaliar só se/quando tiver IP fixo.

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
- [~] Lighthouse CI: Performance >85, Accessibility >90 — CI DESTRAVADA
  2026-08-27, mas Performance real falha o próprio gate. Dois bugs de infra
  achados e corrigidos (commit `820f206`): (1) `lighthouse.yml` só tinha
  gatilho `pull_request` — o projeto faz push direto no main sem PR (ver
  `feedback_git_workflow` na memória), então o job **nunca rodou uma vez
  sequer** desde que foi criado (`gh run list` vazio); adicionado gatilho
  `push:branches:[main]`, mesmo padrão do `ci.yml`. (2) `.lighthouserc.js`
  usava `module.exports` (CommonJS) mas `package.json` tem `"type":
  "module"` — quebrava com `ReferenceError: module is not defined in ES
  module scope` assim que o `lhci` tentava carregar a config (nunca tinha
  sido testado localmente, só existia commitado). Renomeado pra `.cjs`.
  **Validado localmente** rodando `lhci autorun` contra o `dist/` real:
  Accessibility **100**, Best Practices **96**, SEO **100** — todos passam
  o gate. **Performance 52-53** (FALHA, precisa ≥85) — achado real, não é
  bug de CI. Causa raiz: `src/App.tsx` (3552 linhas, carrega em TODA rota
  inclusive login) importa estaticamente a biblioteca `recharts` inteira
  (Line/Bar/Pie/Scatter/Radar/AreaChart) + `jsPDF`/`jspdf-autotable` +
  `framer-motion` — ~3MB (730KB gzip) no bundle inicial mesmo em páginas
  sem gráfico, FCP/LCP ~9.3s. **Decisão do Lucas 2026-08-27:** não mexer no
  `App.tsx` agora (refactor de risco alto, arquivo monolítico sem cobertura
  de teste visível) — deixar registrado como pendência nova, CI vai
  continuar acusando a falha real a cada push (não mascarado). Ver
  `astrum-lighthouse-ci-perf-gap` na memória do Claude Code.
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
