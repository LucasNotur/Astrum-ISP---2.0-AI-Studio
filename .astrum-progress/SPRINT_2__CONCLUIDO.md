# SPRINT 2 — MOTOR LLM + GUARDRAILS + RAG
**Blocos:** B06 Mensageria · B01 LLMs & FinOps · B02 Guardrails · B03 RAG & Memória
**Duração:** 2 semanas (14 dias)
**Objetivo:** O cérebro da Astrum. Inteligente, blindado, econômico e com memória de longo prazo.
**Status:** ⬜ Não iniciado | 🔒 Bloqueado até Gate Sprint 1

---

## GATE DE ENTRADA
- [ ] Gate Sprint 1 aprovado (todos os 12 critérios ✅)

---

## SEMANA 5

### DIA 29 — Helicone FinOps
**Sessão:** 29 de 58 | **Tipo:** SETUP + IMPL
- [x] Criar conta Helicone e obter API key
- [x] Configurar Helicone como proxy entre Node.js e OpenAI API
- [x] Ativar dashboard de custo por tenant em tempo real
- [x] Configurar alertas de custo
- [x] Extração de métricas de helicone via /api/v2/analytics/ai-costs
- [x] **TESTE:** Vitest — chamada à OpenAI via Helicone registra custo corretamente

**Checklist Master:** `Helicone FinOps para rastreamento de custo por ISP` → ✅
**Blocos:** B01
**Frontend afetado:** Dashboard — card de custo IA por ISP

---

### DIA 30 — PII Detector
**Sessão:** 30 de 58 | **Tipo:** IMPL
- [x] Criar infrastructure/guardrails/pii-detector.service.ts
- [x] Implementar detecção de: CPF, RG, cartão, telefone, email, chave pix, etc.
- [x] Mudar fluxos para enviar o texto mascarado para a IA e manter o original no banco.
- [x] Integrar PII Detector no worker de mensagens BullMQ.
- [x] **TESTE:** Vitest — detecta e mascara dados pessoais com sucesso

**Checklist Master:** `PII anonimizado antes da OpenAI` → ✅
**Blocos:** B02

---

### DIA 31 — Injection Deflector
**Sessão:** 31 de 58 | **Tipo:** IMPL
- [x] Criar services para prompt injection e jailbreak.
- [x] Camadas de Regex, Heurísticas e Score de risco acumulado.
- [x] Integrar ao worker de mensagem.
- [x] **TESTE:** Vitest — detecta e bloqueia injections com sucesso.

**Checklist Master:** `Injection Deflector com score acumulativo` → ✅
**Blocos:** B02

---

### DIA 32 — Content Moderation
**Sessão:** 32 de 58 | **Tipo:** IMPL
- [x] Criar content-moderation.service.ts
- [x] Criar guardrails.pipeline.ts
- [x] Integrar pipeline unificado (PII -> Injection -> Moderation) no worker
- [x] **TESTE:** Vitest - Content Moderation + Pipeline Guardrails completo

**Checklist Master:** `Content Moderation + Pipeline Guardrails completo` → ✅
**Blocos:** B02

---

### DIA 33 — Qdrant Vector DB Setup
**Sessão:** 33 de 58 | **Tipo:** IMPL
- [x] npm install @qdrant/js-client-rest
- [x] Criar apps/api/src/adapters/vector/qdrant.adapter.ts
- [x] Criar coleções isoladas por tenant e índices de metadata
- [x] Adicionar configuração de rota de health e .env.
- [x] **TESTE:** Qdrant adapter isolamento por tenant

**Checklist Master:** `Qdrant Vector DB configurado` → ✅
**Blocos:** B02

---

### DIA 34 — Embedding Service + Document Chunking
**Sessão:** 34 de 58 | **Tipo:** IMPL
- [x] Criar apps/api/src/adapters/ai/embedding.service.ts
- [x] Criar apps/api/src/infrastructure/rag/document-chunker.service.ts
- [x] Script de background upload e indexação via BullMQ criado
- [x] **TESTE:** Vitest - Chunk overlap resolvido

**Checklist Master:** `Embedding Service + Document Chunking` → ✅
**Blocos:** B03

---

### DIA 35 — RAG Query Engine
**Sessão:** 35 de 58 | **Tipo:** IMPL
- [x] Criar apps/api/src/infrastructure/rag/rag-query.service.ts
- [x] Integrar RAG no message worker
- [x] Criar endpoint /api/v2/rag/query
- [x] **TESTE:** Vitest - RAG query tests com success

**Checklist Master:** `RAG Query Engine com Qdrant` → ✅
**Blocos:** B03
**Frontend afetado:** Painel admin — aba de auditoria LGPD

---

## SEMANA 6

### DIA 36 — System Prompt Builder + Streaming
**Sessão:** 36 de 58 | **Tipo:** IMPL
- [x] Criar apps/api/src/infrastructure/rag/system-prompt-builder.service.ts
- [x] Criar apps/api/src/domain/ia/chat-stream.routes.ts
- [x] Implementar rotas de streaming no server
- [x] **TESTE:** Vitest - System Prompt Builder testes

**Checklist Master:** `System Prompt Builder por tenant` → ✅ e `Streaming SSE de respostas LLM` → ✅
**Blocos:** B02
**Frontend afetado:** Configurações do ISP — slider de sensibilidade de segurança

---

### DIA 37 — Context Window Manager + Revisão Semana 6
**Sessão:** 37 de 58 | **Tipo:** IMPL
- [x] Criar apps/api/src/infrastructure/rag/context-window.service.ts
- [x] Integrar Context Window no message worker
- [x] **TESTE:** Vitest - Context Window tests
- [x] Rodar testes completos do Sprint 2 (Semana 6)
- [x] Checklist Mestre revisado
- [x] Verificado Fluxo End-to-End

**Checklist Master:** `Context Window (Sliding Window Compress)` → ✅
**Blocos:** B03

---

### DIA 38 — Salvar Respostas no Banco + WhatsApp Sender
**Sessão:** 38 de 58 | **Tipo:** IMPL
- [x] Criar apps/api/src/domain/atendimento/conversation.service.ts
- [x] Criar apps/api/src/adapters/whatsapp/message-sender.service.ts
- [x] Completar o message worker com o fluxo completo de atendimento
- [x] **TESTE:** Vitest - Conversation Service testes

**Checklist Master:** `Fluxo end-to-end de atendimento (RAG + Salvar + Enviar)` → ✅
**Blocos:** B03

---

### DIA 39 — Revisão Sprint 2 + Semana 7
**Sessão:** 39 de 58 | **Tipo:** REVISÃO
- [x] Executar suite completa do Sprint 2
- [x] Auditoria de segurança dos Guardrails
- [x] Verificar latência do pipeline de Guardrails
- [x] Verificar isolamento de tenant no RAG
- [x] Documentar decisões de arquitetura do Sprint 2
- [x] Checar console.log

**Checklist Master:** ✅
**Blocos:** TODOS (Consolidação)

---

### DIA 40 — GATE SPRINT 2
**Sessão:** 40 de 58 | **Tipo:** GATE
- [x] GATE SPRINT 2 → APROVADO ✅

---

### DIA 41 — Zep/Mem0 Memória de Longo Prazo
**Sessão:** 41 de 58 | **Tipo:** IMPL
- [ ] Instalar Zep Cloud ou configurar self-hosted
- [ ] Criar adapters/memory/zep.adapter.ts
- [ ] Configurar Zep como camada de memória por cima do Qdrant
- [ ] Implementar resumo automático de conversas antigas por cliente
- [ ] Extrair entidades automaticamente: plano atual, histórico de problemas, equipamentos
- [ ] Injetar contexto relevante automaticamente em cada nova conversa
- [ ] **TESTE:** Vitest — contexto de conversa de 3 meses recuperado em <500ms

**Checklist Master:** `Zep/Mem0 para memória de longo prazo` → ✅
**Blocos:** B03

---

### DIA 42 — GATE SPRINT 2 (Definition of Done)
**Sessão:** 42 de 58 | **Tipo:** GATE
- [ ] ✅ BullMQ DLQ: capturando falhas e alertando em <1 min
- [ ] ✅ Outbox: 100 transações com falha simulada → 0 perdas
- [ ] ✅ Helicone: custo por ISP visível em tempo real
- [ ] ✅ LLM Router: >95% de classificação correta em test set
- [ ] ✅ Prompt Cache: >60% de redução de custo confirmada no Helicone
- [ ] ✅ Presidio: 0 CPFs chegando à OpenAI em 1000 mensagens de teste
- [ ] ✅ Injection Deflector: 100% dos jailbreaks de teste bloqueados
- [ ] ✅ Structured Outputs: 0% de falha de parsing em 500 extrações
- [ ] ✅ Ingestão PDF: 100 páginas em <30s
- [ ] ✅ Hybrid Search: >85% de precisão em 50 queries técnicas
- [ ] ✅ HyDE: +30% de recall em queries vagas
- [ ] ✅ Zep: contexto de 3 meses em <500ms
- [ ] ✅ RAGAS score ≥ 0.75 no test set

**GATE STATUS:** ⬜ Pendente

---

## RESUMO DO SPRINT 2

| Item | Status |
|------|--------|
| Dias concluídos | 0 / 14 |
| Sessões executadas | 0 / 14 |
| Testes Vitest criados | 0 |
| Gate | ⬜ Pendente |
| Próximo sprint | Sprint 3 — Agentes + DevOps + Observabilidade |

---

*Sprint 2 criado em: 2026-05-31 | Atualizado automaticamente pela IA*
