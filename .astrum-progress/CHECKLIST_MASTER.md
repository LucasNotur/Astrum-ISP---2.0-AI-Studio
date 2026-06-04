# ASTRUM AI ENGINE — CHECKLIST MASTER
> Rastreamento central de progresso da implementação dos 12 Blocos Tecnológicos
> Atualizado automaticamente pela IA ao final de cada sessão

---

## 📊 SCORECARD GERAL

| Sprint | Período | Blocos | Progresso | Gate |
|--------|---------|--------|-----------|------|
| Sprint 0 | Semanas 1–2 | B12 Padrões Arquiteturais | 0/14 dias | ⬜ Pendente |
| Sprint 1 | Semanas 3–4 | B07 Backend + B09 Segurança + B05 Dados | 0/14 dias | ⬜ Pendente |
| Sprint 2 | Semanas 5–6 | B06 Mensageria + B01 LLMs + B02 Guardrails + B03 RAG | 0/14 dias | ⬜ Pendente |
| Sprint 3 | Semanas 7–8 | B04 Agentes + B10 DevOps + B11 Observabilidade | 0/14 dias | ⬜ Pendente |
| Sprint 4 | Semanas 9–10 | B08 Frontend | 0/14 dias | ⬜ Pendente |
| Sprint 5 | Semanas 11–12 | Integração E2E | 0/14 dias | ⬜ Pendente |
| Sprint 6 | Semanas 13–14 | Escala Multi-tenant | 0/14 dias | ⬜ Pendente |

**Progresso Total: 0 / 98 dias concluídos**

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
- [ ] Monorepo TurboRepo: apps/web + apps/api + packages/*
- [ ] Dockerfile multi-stage testado localmente
- [ ] GitHub Actions: lint → vitest → playwright → build → deploy
- [ ] Ephemeral environments por PR
- [ ] Pulumi IaC: toda infraestrutura em código TypeScript
- [ ] Graceful Shutdown: SIGTERM handler no Node.js
- [ ] Zero Firebase no código de produção
- [ ] Zero Express no código (100% Fastify)

### Banco de Dados & Storage
- [ ] RLS em TODAS as tabelas desde a primeira migration
- [ ] Supabase Realtime (CDC) nas tabelas críticas
- [ ] Cloudflare R2 com zero egress configurado
- [ ] Outbox table criada (id, payload, sent_at, attempts)
- [ ] Idempotency keys table criada
- [ ] WAL ativo e testado com crash recovery
- [ ] DuckDB in-process para analytics pesados

### IA & RAG
- [ ] Helicone mostrando custo por ISP em tempo real
- [ ] LLM Router: GPT-4o-mini para chat, GPT-4o para raciocínio
- [ ] Prompt Caching ativo em system instructions longas
- [ ] Zod schemas em TODOS os outputs da IA
- [ ] PII anonimizado antes da OpenAI (CPF, CC → [DADO_SENSIVEL])
- [ ] LangSmith tracing sempre ativo (staging + prod)
- [ ] Qdrant com particionamento por ISP (tenant_id)
- [ ] Pipeline de ingestão PDF testado (200 páginas sem erros)
- [ ] Hybrid Search (BM25 + Semântico) com score fusion
- [ ] HyDE para queries vagas implementado
- [ ] Zep/Mem0 para memória de longo prazo
- [ ] RAGAS score ≥ 0.75 no test set
- [ ] LangGraph state machines para todos os fluxos
- [ ] LLM-as-a-Judge bloqueando regressões em deploy

### Segurança
- [ ] CI job: grep no repositório = zero API keys
- [ ] JWT rotation: 15 minutos no Supabase Auth
- [ ] RBAC: Técnico / Gestor / Admin testados via E2E
- [ ] HMAC em todos os webhooks (WhatsApp, pagamentos, ISP)
- [ ] Circuit Breaker em OpenAI, WhatsApp, pagamentos
- [ ] Rate Limiting (Token Bucket) em todas as rotas públicas
- [ ] Argon2id para todas as senhas de usuários
- [ ] VPC: Supabase + Redis sem acesso público direto

### Qualidade & Observabilidade
- [ ] Sentry em staging E produção com source maps
- [ ] Pino.js: zero console.log no código de produção
- [ ] Playwright E2E: login → fatura → chat → ticket completo
- [ ] Lighthouse CI: Performance >85, Accessibility >90
- [ ] LLM-as-a-Judge automatizado em cada deploy de prompts
- [ ] Synthetic monitoring rodando 24/7

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
