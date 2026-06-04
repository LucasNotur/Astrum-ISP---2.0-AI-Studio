# ASTRUM — ESTRUTURA PADRÃO DOS PROMPTS
> Guia de referência para criação e leitura dos prompts de sessão.
> Use este documento para recriar qualquer prompt ou entender como funciona o sistema.

---

## 📐 VISÃO GERAL DO SISTEMA

Cada **sessão** corresponde a **1 dia do plano de execução**. Os prompts são executados no **Google AI Studio** (ou equivalente com janela de contexto grande), onde o código completo da Astrum já está carregado como contexto base.

```
FLUXO DE EXECUÇÃO:
─────────────────────────────────────────────────────────────
  Antigravity (aqui)          VOCÊ              AI STUDIO
       │                        │                    │
       │  Gera prompt           │                    │
       │ ──────────────────►    │                    │
       │                        │  Cola o prompt     │
       │                        │ ─────────────────► │
       │                        │                    │ Executa / cria código
       │                        │ ◄───────────────── │
       │                        │  Copia output      │
       │                        │  (arquivos criados)│
       │                        │ Salva localmente   │
       │                        │  no repositório    │
─────────────────────────────────────────────────────────────
```

---

## 🏗️ ANATOMIA DE UM PROMPT DE SESSÃO

Cada sessão é composta por **3 camadas obrigatórias**:

```
┌─────────────────────────────────────────────────────────┐
│  CAMADA 1 — CABEÇALHO DE IDENTIFICAÇÃO                  │
│  Identifica a sessão no plano geral                      │
├─────────────────────────────────────────────────────────┤
│  CAMADA 2 — CORPO DO PROMPT                             │
│  O que a IA deve fazer (tarefas, código, regras)        │
├─────────────────────────────────────────────────────────┤
│  CAMADA 3 — CHECKLIST UPDATE                            │
│  O que deve ser marcado como concluído ao final         │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 TEMPLATE COMPLETO DE UMA SESSÃO

> ⚠️ **IMPORTANTE:** Todo prompt DEVE incluir o BLOCO DE PROTEÇÃO logo após o cabeçalho.
> Regras completas em: `REGRAS_AI_STUDIO.md`

```markdown
# ═══════════════════════════════════════════════════
# SESSÃO [N] — DIA [N]: [NOME DA SESSÃO EM CAPS]
# Sprint [X] | Sessão [N] de [TOTAL] | Tipo: [TIPO]
# Bloco: [BLOCO] — [NOME DO BLOCO]
# ═══════════════════════════════════════════════════

⚠️ AMBIENTE: Google AI Studio (sandbox gerenciado).
- NÃO execute npm install, npm i, yarn add, pnpm add
- NÃO execute npx shadcn@latest, npx tailwindcss init, npx create-*
- Substitua qualquer comando npm/npx pelo código que ele geraria
- Verifique package.json antes de qualquer import externo
- NÃO modifique imports existentes em App.tsx — apenas adicione no final
- Crie TODOS os arquivos importados na mesma sessão (sem imports pendentes)

## PROMPT [NA] — [TÍTULO DO PROMPT]

### CONTEXTO
[1-3 parágrafos explicando O QUÊ e POR QUÊ essa implementação
 existe. Inclui o problema que resolve e a decisão técnica.]

### TAREFA [N] — [NOME DA TAREFA]
[Descrição da tarefa + código completo a implementar]

### REGRAS INEGOCIÁVEIS
- [Regra 1 — sem exceção]
- [Regra 2 — sem exceção]

### TESTES A CRIAR (quando aplicável)
[Arquivo de teste + código completo do teste Vitest/Playwright]

### CHECKLIST UPDATE
\`\`\`
═══════════════════════════════════════
SESSÃO [N] CONCLUÍDA
Sprint: [X] | Dia: [N] | Tipo: [TIPO]
Tarefa: [nome resumido]
Dependências novas (não instaladas): [lista ou "nenhuma — tudo já no package.json"]
Arquivos criados:
  + [caminho/arquivo1.ts]
  + [caminho/arquivo2.ts]
Arquivos modificados:
  ~ [caminho/arquivo3.ts]
Arquivos deletados:
  - [caminho/arquivo4.ts]
Checklist para atualizar:
  sprint_[X].md → Dia [N] → marcar todos os [ ] como [x]
  CHECKLIST_MASTER.md → "[item]" → ✅
Próxima sessão: Sessão [N+1] — [nome]
═══════════════════════════════════════
\`\`\`
```

---

## 🏷️ GLOSSÁRIO DOS CAMPOS DO CABEÇALHO

| Campo | Valores Possíveis | Descrição |
|-------|-------------------|-----------|
| `Sprint` | 0, 1, 2, 3, 4, 5, 6 | Sprint do plano de execução |
| `Sessão N de TOTAL` | ex: `3 de 14` | Posição dentro do sprint |
| `Tipo` | `SETUP`, `IMPL`, `REFACTOR`, `QA`, `GATE` | Natureza da tarefa |
| `Bloco` | B01 a B12 | Bloco tecnológico do roadmap |

### Tipos de Sessão

| Tipo | Significa | O que a IA faz |
|------|-----------|----------------|
| `SETUP` | Configuração inicial | Analisa, documenta, estrutura pastas |
| `IMPL` | Implementação | Cria novos arquivos e funcionalidades |
| `REFACTOR` | Refatoração | Modifica arquivos existentes |
| `QA` | Quality Assurance | Cria testes, valida critérios |
| `GATE` | Gate de Sprint | Valida TODOS os critérios antes de avançar |

---

## 📁 ORGANIZAÇÃO DOS ARQUIVOS DE PROMPTS

Os prompts são salvos em `.astrum-progress/` com a seguinte convenção:

```
.astrum-progress/
├── ESTRUTURA_PROMPTS.md        ← ESTE ARQUIVO (referência)
├── CHECKLIST_MASTER.md         ← Scorecard geral de todos os sprints
├── PROGRESS_LOG.md             ← Log cronológico de sessões executadas
│
├── sprint_0.md                 ← Checklist Sprint 0 (dias 1-14)
├── sprint_1.md                 ← Checklist Sprint 1 (dias 15-28)
├── sprint_2.md                 ← Checklist Sprint 2 (dias 29-42)
├── sprint_3.md                 ← Checklist Sprint 3 (dias 43-56)
├── sprint_4.md                 ← Checklist Sprint 4 (dias 57-70)
├── sprint_5_6.md               ← Checklist Sprints 5+6 (dias 71-98)
│
├── prompts_sprint0_s1.md       ← Prompts Sessões 1-2   (Sprint 0)
├── prompts_sprint0_s2.md       ← Prompts Sessões 3-4   (Sprint 0)
├── prompts_sprint0_s3.md       ← Prompts Sessões 5-6-7 (Sprint 0)
├── prompts_sprint0_s4.md       ← Prompts Sessões 8-9   (Sprint 0)
├── prompts_sprint0_s5.md       ← Prompts Sessões 10-12 (Sprint 0)
└── prompts_sprint0_s6.md       ← Prompts Sessões 13-14 (Sprint 0)
```

> **Convenção de nome:** `prompts_sprint[N]_s[PARTE].md`
> Cada arquivo agrupa 2-3 sessões para não ficar pesado demais.

---

## ✍️ REGRAS DE ESCRITA DOS PROMPTS

### 1. O CONTEXTO vem antes do código
Sempre explicar **o problema que resolve** e **por que essa abordagem** antes de qualquer bloco de código.

```markdown
### CONTEXTO
A Astrum usa a API da OpenAI para responder mensagens via WhatsApp.
Atualmente, se a OpenAI cair, o sistema trava indefinidamente — 
bloqueando toda a fila de atendimento. O Circuit Breaker resolve isso
retornando uma resposta de fallback imediatamente.
```

### 2. TAREFAS são numeradas e atômicas
Cada tarefa é uma unidade de trabalho independente. A IA completa a Tarefa 1 antes de passar para a Tarefa 2.

```markdown
### TAREFA 1 — Criar arquivo de configuração
[código]

### TAREFA 2 — Criar o adapter
[código que depende do arquivo da Tarefa 1]

### TAREFA 3 — Criar os testes
[testes do que foi criado nas Tarefas 1 e 2]
```

### 3. REGRAS INEGOCIÁVEIS são absolutas
São restrições que a IA nunca pode ignorar. Sempre incluir no final do prompt antes do Checklist.

```markdown
### REGRAS INEGOCIÁVEIS
- TypeScript strict: sem `any` nos tipos de retorno das funções públicas
- O fallback NUNCA pode lançar exceção — retornar resposta degradada
- Nenhum import de Firebase nos arquivos novos
- Os logs devem ter prefixo `[NOME_MODULO]` para filtro no Sentry
```

### 4. TESTES são incluídos na mesma sessão
Para cada arquivo `.ts` criado, criar o `.test.ts` correspondente na mesma sessão. Não deixar para depois.

### 5. CHECKLIST UPDATE é padronizado
O bloco final é sempre o mesmo formato — a IA preenche e o operador usa para atualizar os `.md` de progresso.

---

## 🔗 COMO OS PROMPTS SE ENCADEIAM

Cada prompt termina referenciando o próximo, criando uma cadeia contínua:

```
Sessão 1 (SETUP: Auditoria)
    │ → produz: AUDITORIA_ARQUITETURAL.md
    ▼
Sessão 2 (SETUP: Estrutura DDD)
    │ → usa: output da Sessão 1
    │ → produz: estrutura de pastas + supabase.client.ts + redis.client.ts
    ▼
Sessão 3 (IMPL: Circuit Breaker)
    │ → usa: openai.adapter.ts criado na Sessão 2
    │ → produz: circuit-breaker.config.ts + openai.adapter.ts completo
    ▼
Sessão 4 (IMPL: Idempotency)
    │ → usa: supabase.client.ts da Sessão 2
    │ → produz: 001_idempotency_keys.sql + idempotency.middleware.ts
    ▼
...e assim por diante até a Sessão 14 (GATE: validação final)
```

---

## 📊 MAPA DE SESSÕES × SPRINTS

| Sprint | Dias | Sessões | Arquivo de Prompts | Status |
|--------|------|---------|-------------------|--------|
| Sprint 0 | 1-14 | 1 a 14 | `prompts_sprint0_s1.md` a `s6.md` | ✅ Criados |
| Sprint 1 | 15-28 | 15 a 28 | A criar conforme execução | ⬜ |
| Sprint 2 | 29-42 | 29 a 42 | A criar conforme execução | ⬜ |
| Sprint 3 | 43-56 | 43 a 56 | A criar conforme execução | ⬜ |
| Sprint 4 | 57-70 | 57 a 70 | A criar conforme execução | ⬜ |
| Sprint 5 | 71-84 | 71 a 84 | A criar conforme execução | ⬜ |
| Sprint 6 | 85-98 | 85 a 98 | A criar conforme execução | ⬜ |

> **Nota:** Os prompts das Sessões 15 em diante são gerados sob demanda pelo Antigravity
> conforme o usuário executa cada sessão e pede a próxima.

---

## 💬 COMO PEDIR O PRÓXIMO PROMPT AO ANTIGRAVITY

Para pedir o próximo prompt, simplesmente diga:

```
"próxima" ou "proxima"
```

O Antigravity entregará o prompt da próxima sessão diretamente no chat,
pronto para copiar e colar no AI Studio.

Se precisar **retomar de uma sessão específica** (ex: após restaurar backup):

```
"Me envie o prompt da Sessão [N]"
```

O Antigravity buscará o histórico do log de conversa e reproduzirá
o prompt correto para aquela sessão.

---

## 🗂️ BLOCOS TECNOLÓGICOS (referência)

| Bloco | Nome | Sprint Principal |
|-------|------|-----------------|
| B01 | LLMs & FinOps (Helicone, LLM Router, Batch API) | Sprint 2 |
| B02 | Guardrails (Presidio PII, Injection Deflector, Zod) | Sprint 2 |
| B03 | RAG & Memória (Qdrant, HyDE, Zep/Mem0) | Sprint 2 |
| B04 | Agentes (LangGraph, Agentic RAG, BullMQ Durable) | Sprint 3 |
| B05 | Dados (Supabase RLS, DuckDB, R2, Realtime CDC) | Sprint 1 |
| B06 | Mensageria (Redis AOF, BullMQ DLQ, Outbox Pattern) | Sprint 2 |
| B07 | Backend (Fastify, WebSockets, SSE, HMAC) | Sprint 1 |
| B08 | Frontend (React 18, Zustand, TanStack, Lighthouse) | Sprint 4 |
| B09 | Segurança (Argon2id, RBAC, JWT Rotation, RLS) | Sprint 1 |
| B10 | DevOps (Docker, GitHub Actions, Ephemeral Envs, Pulumi) | Sprint 3 |
| B11 | Observabilidade (Sentry, LangSmith, RAGAS, Vitest) | Sprint 3 |
| B12 | Padrões (Circuit Breaker, Idempotency, Token Bucket, CRDT) | Sprint 0 |

---

## 🛡️ ARQUIVO DE REGRAS DE PROTEÇÃO

O arquivo `REGRAS_AI_STUDIO.md` (nesta mesma pasta) contém:
- O **BLOCO DE PROTEÇÃO** pronto para copiar e colar nos prompts
- Explicação de por que cada regra existe
- Lista completa de pacotes já instalados
- Instruções para adaptar prompts já existentes

---

*Documento criado em: 2026-06-03 | Atualizado automaticamente pelo Antigravity*
