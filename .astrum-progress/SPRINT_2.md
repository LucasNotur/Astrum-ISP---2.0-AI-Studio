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

### DIA 29 — BullMQ Production-Grade + DLQ
**Sessão:** 29 de 58 | **Tipo:** IMPL
- [ ] Criar filas separadas: cobranca, whatsapp, ai_processing, notifications, suspension
- [ ] Configurar retry com backoff exponencial: 1min → 5min → 15min
- [ ] Implementar Dead Letter Queue (DLQ) para jobs falhados 3x
- [ ] Configurar alerta no Sentry quando job vai para DLQ
- [ ] Priority Queue: suspensões = prioridade máxima
- [ ] Atualizar todos os workers existentes para usar filas nomeadas corretas
- [ ] Criar painel de jobs no frontend (lista de jobs pendentes/falhos/concluídos)
- [ ] **TESTE:** Vitest — simular crash Node.js durante processamento → 0 mensagens perdidas

**Checklist Master:** Nenhum item novo (otimização BullMQ existente)
**Blocos:** B06
**Frontend afetado:** Painel admin — aba de filas BullMQ

---

### DIA 30 — Outbox Pattern
**Sessão:** 30 de 58 | **Tipo:** IMPL
- [ ] Criar migration: tabela outbox_events (id, aggregate_id, event_type, payload, sent_at, attempts)
- [ ] Criar infrastructure/outbox/outbox.worker.ts
- [ ] Implementar: DB atualizado E outbox gravado na mesma transação PostgreSQL
- [ ] Worker lê outbox e envia para BullMQ de forma atômica
- [ ] Aplicar em TODAS as operações que gravam no banco E disparam evento
- [ ] **TESTE:** Vitest — simular falha de rede após DB write → job enviado quando conexão volta

**Checklist Master:** `Outbox table criada` → ✅
**Blocos:** B06

---

### DIA 31 — Helicone FinOps
**Sessão:** 31 de 58 | **Tipo:** SETUP + IMPL
- [ ] Criar conta Helicone e obter API key
- [ ] Configurar Helicone como proxy entre Node.js e OpenAI API (uma linha de mudança)
- [ ] Ativar dashboard de custo por tenant em tempo real
- [ ] Configurar alertas: custo de ISP ultrapassa threshold configurável
- [ ] Monitorar latência p95 por endpoint
- [ ] Criar widget no dashboard Astrum mostrando custo IA do mês (por ISP)
- [ ] **TESTE:** Vitest — chamada à OpenAI via Helicone registra custo corretamente

**Checklist Master:** `Helicone mostrando custo por ISP em tempo real` → ✅
**Blocos:** B01
**Frontend afetado:** Dashboard — card de custo IA por ISP

---

### DIA 32 — LLM Router
**Sessão:** 32 de 58 | **Tipo:** IMPL
- [ ] Criar packages/ai/src/llm-router.ts
- [ ] Implementar classificador de complexidade de mensagem
- [ ] Rota simples (saudações, status básico) → GPT-4o-mini
- [ ] Rota complexa (diagnóstico técnico, análise de churn, manuais) → GPT-4o
- [ ] Log de cada decisão de roteamento via Helicone para auditoria
- [ ] Integrar no adapter LLM unificado (Dia 9)
- [ ] **TESTE:** Vitest — test set de 100 queries → router classifica >95% corretamente

**Checklist Master:** `LLM Router: GPT-4o-mini para chat, GPT-4o para raciocínio` → ✅
**Blocos:** B01

---

### DIA 33 — Prompt Caching + Batch API
**Sessão:** 33 de 58 | **Tipo:** IMPL
- [ ] Ativar Context Caching nas system instructions dos ISPs (Cache-Control headers)
- [ ] Medir hit rate antes e depois via Helicone
- [ ] Implementar pipeline noturno via OpenAI Batch API para análise de churn
- [ ] Criar BullMQ job agendado (00:00) que processa histórico de tickets em lote
- [ ] Validar: Prompt Cache reduzindo custo >60% em conversas longas
- [ ] **TESTE:** Vitest — mesma system instruction chamada 2x → segunda tem cache hit

**Checklist Master:** `Prompt Caching ativo em system instructions longas` → ✅
**Blocos:** B01

---

### DIA 34 — Zod Structured Outputs
**Sessão:** 34 de 58 | **Tipo:** IMPL
- [ ] Definir schemas Zod para TODOS os outputs da IA que afetam o banco de dados
- [ ] Implementar generateObject com JSON Mode em todas as extrações de dados
- [ ] Criar packages/shared/src/schemas/ai-outputs.schemas.ts com todos os schemas
- [ ] Garantir: nunca JSON.parse sem validação Zod antes
- [ ] Criar teste automatizado: IA com schema mal-formatado → rejeitar e logar no Sentry
- [ ] **TESTE:** Vitest — 500 extrações simuladas → 0% de falha de parsing

**Checklist Master:** `Zod schemas em TODOS os outputs da IA` → ✅
**Blocos:** B02

---

### DIA 35 — Microsoft Presidio PII
**Sessão:** 35 de 58 | **Tipo:** IMPL
- [ ] Criar packages/ai/src/guardrails/pii-anonymizer.ts
- [ ] Detectar e substituir: CPF, CNPJ, cartão, email, telefone → [DADO_SENSIVEL]
- [ ] Implementar como middleware obrigatório ANTES de cada chamada à OpenAI
- [ ] Log de cada anonimização para auditoria LGPD
- [ ] Criar painel de auditoria LGPD no frontend (log de dados anonimizados)
- [ ] **TESTE:** Vitest — 1000 mensagens com CPF → 0 CPFs chegam à OpenAI

**Checklist Master:** `PII anonimizado antes da OpenAI` → ✅
**Blocos:** B02
**Frontend afetado:** Painel admin — aba de auditoria LGPD

---

## SEMANA 6

### DIA 36 — Prompt Injection Deflector
**Sessão:** 36 de 58 | **Tipo:** IMPL
- [ ] Criar packages/ai/src/guardrails/injection-deflector.ts
- [ ] Implementar classificador leve de tentativas de jailbreak
- [ ] Threshold de score para bloqueio configurável por ISP no painel
- [ ] Log de mensagens bloqueadas no Sentry (payload anonimizado)
- [ ] Criar UI de configuração do threshold no painel do ISP
- [ ] **TESTE:** Vitest — 20 tentativas de jailbreak conhecidas → 100% bloqueadas

**Checklist Master:** Nenhum item direto (segurança cognitiva)
**Blocos:** B02
**Frontend afetado:** Configurações do ISP — slider de sensibilidade de segurança

---

### DIA 37 — Chain of Thought + Few-Shot Dinâmico
**Sessão:** 37 de 58 | **Tipo:** IMPL
- [ ] Implementar CoT em todos os prompts de diagnóstico técnico e financeiro
- [ ] Criar pipeline de Few-Shot: Qdrant busca 3 tickets resolvidos similares → injeta no prompt
- [ ] Criar packages/ai/src/prompts/templates/ com templates por domínio
- [ ] Executar teste A/B: resposta com CoT vs sem CoT em 100 perguntas técnicas
- [ ] **TESTE:** Vitest — CoT ativo melhora acurácia em perguntas técnicas de ISP

**Checklist Master:** Nenhum item direto (qualidade de prompts)
**Blocos:** B02

---

### DIA 38 — Pipeline de Ingestão RAG
**Sessão:** 38 de 58 | **Tipo:** IMPL
- [ ] Criar packages/ai/src/rag/ingestion-pipeline.ts
- [ ] Implementar Semantic Chunking com análise de parágrafos (não corte por palavras)
- [ ] Implementar Overlap de 20% entre chunks para preservar contexto
- [ ] Gerar embeddings via text-embedding-3-small → vetores no Qdrant com payload ISP_ID
- [ ] Criar rota POST /api/rag/ingest para upload de documentos
- [ ] Criar UI completa de upload de PDF/DOCX/TXT no painel com barra de progresso
- [ ] Criar visualização de status de ingestão (quantos chunks processados)
- [ ] **TESTE:** Vitest — PDF de 100 páginas ingerido em <30 segundos, sem perda de contexto

**Checklist Master:** `Pipeline de ingestão PDF testado` → ✅
**Blocos:** B03
**Frontend afetado:** Página de Configurações ISP — aba de Base de Conhecimento

---

### DIA 39 — Hybrid Search BM25 + Semântico
**Sessão:** 39 de 58 | **Tipo:** IMPL
- [ ] Implementar busca semântica via Qdrant
- [ ] Implementar BM25 para termos técnicos exatos (IPs, modelos de equipamento, siglas)
- [ ] Configurar score fusion: 60% semântico + 40% BM25
- [ ] Filtro obrigatório por ISP_ID em TODAS as buscas
- [ ] **TESTE:** Vitest — precisão >85% em 50 queries técnicas reais de ISP

**Checklist Master:** `Hybrid Search (BM25 + Semântico)` → ✅
**Blocos:** B03

---

### DIA 40 — HyDE para Queries Vagas
**Sessão:** 40 de 58 | **Tipo:** IMPL
- [ ] Criar packages/ai/src/rag/hyde.service.ts
- [ ] Implementar: query vaga → IA gera laudo hipotético → laudo vira query de busca → acha o real
- [ ] Integrar HyDE no pipeline RAG principal (ativado automaticamente para queries curtas)
- [ ] Comparar precisão: HyDE vs busca direta em 100 queries vagas
- [ ] **TESTE:** Vitest — HyDE melhora recall >30% em queries vagas ("a internet caiu")

**Checklist Master:** `HyDE para queries vagas implementado` → ✅
**Blocos:** B03

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
