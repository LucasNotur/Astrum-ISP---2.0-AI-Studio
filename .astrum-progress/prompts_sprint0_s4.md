# PROMPTS DO SPRINT 0 — PARTE 4
## Sessões 8 e 9 (Dias 8 e 9) — Semana 2

---

# ═══════════════════════════════════════════════════
# SESSÃO 8 — DIA 8: REMOÇÃO DO FIREBASE
# Sprint 0 | Sessão 8 de 14 | Tipo: REFACTOR
# Bloco: B12 — Padrões Arquiteturais
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload:
- `src/lib/firebase.ts`
- `src/lib/firebaseAdmin.ts`
- `src/lib/queue.ts` (usa firebaseAdmin na função setupDLQ)
- `src/lib/db.ts` (primeiras 80 linhas — verificar uso de Firebase)
- `apps/api/src/infrastructure/queue/bullmq.client.ts` (criado Sessão 2)
- `.astrum-progress/sprint_0.md`
- `.astrum-progress/PROGRESS_LOG.md`

---

## PROMPT 8A — MAPEAR E REMOVER TODOS OS IMPORTS DO FIREBASE

### CONTEXTO
O projeto atual usa Firebase/Firestore como banco secundário legado. Isso cria uma dependência
desnecessária com o Google Cloud (já pagamos pelo Supabase), aumenta a complexidade de
manutenção e viola o princípio de Vendor Agnostic. O Firebase precisa ser completamente removido.

Nos arquivos fornecidos, identifique TODOS os imports e usos de Firebase/Firestore.

### TAREFA 1 — Auditoria de Uso do Firebase

Produza uma tabela completa:

| Arquivo | O que usa do Firebase | Substituto no Supabase | Prioridade |
|---------|----------------------|------------------------|-----------|
| `src/lib/firebase.ts` | initializeApp, getFirestore | supabase.client.ts | DELETAR |
| `src/lib/firebaseAdmin.ts` | Admin SDK, Firestore Admin | supabaseClient admin | DELETAR |
| `src/lib/queue.ts` | adminDb.collection('dead_letter_queue') | tabela DLQ no Supabase | ALTA |
| [outros encontrados] | ... | ... | ... |

### TAREFA 2 — Criar tabela DLQ no Supabase (substitui Firestore)

Crie `packages/db/src/migrations/002_dead_letter_queue.sql`:

```sql
-- Dead Letter Queue — jobs do BullMQ que falharam após todas as tentativas
-- Substitui o uso do Firestore em src/lib/queue.ts (função setupDLQ)

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  job_name TEXT NOT NULL,           -- ex: 'process-message', 'send-cobrai'
  queue_name TEXT NOT NULL,         -- ex: 'whatsapp', 'cobranca'
  payload JSONB NOT NULL,
  error_message TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  tenant_id UUID,
  failed_at TIMESTAMPTZ DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,                 -- user_id de quem resolveu manualmente
  notes TEXT                        -- anotações da resolução manual
);

CREATE INDEX IF NOT EXISTS idx_dlq_tenant ON dead_letter_queue (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dlq_resolved ON dead_letter_queue (resolved, failed_at);
CREATE INDEX IF NOT EXISTS idx_dlq_job_name ON dead_letter_queue (job_name);

ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;

-- Super admins veem tudo, tenants veem apenas seus jobs
CREATE POLICY "super_admin_all" ON dead_letter_queue
  USING (auth.jwt() ->> 'role' = 'super_admin');

CREATE POLICY "tenant_own_jobs" ON dead_letter_queue
  USING (tenant_id = auth.uid());

COMMENT ON TABLE dead_letter_queue IS
  'Jobs do BullMQ que falharam após todas as tentativas de retry.
   Substitui o Firestore dead_letter_queue removido no Sprint 0.
   Visível no painel admin para resolução manual.';
```

### TAREFA 3 — Reescrever setupDLQ sem Firebase

Atualize `apps/api/src/infrastructure/queue/bullmq.client.ts`.

Localize a função `setupDLQ` que atualmente usa `firebaseAdmin` e reescreva-a usando Supabase:

```typescript
// REMOVER este import (não deve existir mais):
// import { adminDb } from '../../../lib/firebaseAdmin';

// ADICIONAR no topo do arquivo:
import { supabaseClient } from '../database/supabase.client';

// REESCREVER setupDLQ:
export function setupDLQ(worker: Worker): void {
  worker.on('failed', async (job, err) => {
    if (!job) return;
    
    const attempts = job.attemptsMade;
    const maxAttempts = job.opts?.attempts ?? 3;
    
    if (attempts >= maxAttempts) {
      const { error } = await supabaseClient.from('dead_letter_queue').insert({
        job_id: job.id,
        job_name: job.name,
        queue_name: job.queueName,
        payload: job.data,
        error_message: err.message,
        retry_count: attempts,
        tenant_id: job.data?.tenantId ?? null,
      });

      if (error) {
        console.error('[DLQ] Erro ao salvar job no Supabase DLQ:', error.message);
      } else {
        console.error(`[DLQ] Job ${job.name} (${job.id}) movido para DLQ após ${attempts} tentativas: ${err.message}`);
      }
    }
  });
}
```

### TAREFA 4 — Remover dependências do Firebase

No `package.json` principal, remova as dependências:
```
"firebase": "^12.13.0"     ← REMOVER
"firebase-admin": "^13.10.0" ← REMOVER
```

Adicione um comentário no `package.json` (em forma de campo customizado) para documentar:
```json
"_removed_dependencies": {
  "firebase": "Removido Sprint 0 Dia 8 — migrado para Supabase",
  "firebase-admin": "Removido Sprint 0 Dia 8 — migrado para Supabase"
}
```

### TAREFA 5 — Verificação final

Produza um relatório confirmando:
- [ ] Nenhum arquivo ainda importa `firebase` ou `firebase-admin`
- [ ] A função `setupDLQ` usa Supabase (não Firestore)
- [ ] Os arquivos `src/lib/firebase.ts` e `src/lib/firebaseAdmin.ts` estão marcados para deleção (não apague ainda — crie um arquivo `src/lib/DEPRECATED.md` listando o que será deletado)

### CHECKLIST UPDATE
```
═══════════════════════════════════════
SESSÃO 8 CONCLUÍDA
Sprint: 0 | Dia: 8 | Tipo: REFACTOR
Tarefa: Remoção do Firebase
Arquivos criados:
  + packages/db/src/migrations/002_dead_letter_queue.sql
  + src/lib/DEPRECATED.md
Arquivos modificados:
  ~ apps/api/src/infrastructure/queue/bullmq.client.ts (setupDLQ → Supabase)
  ~ package.json (firebase removido)
Checklist para atualizar:
  sprint_0.md → Dia 8 → marcar todos os [ ] como [x]
  CHECKLIST_MASTER.md → "Zero Firebase no código de produção" → ✅
Próxima sessão: Sessão 9 — Dia 9 — Unificação Motor de IA
═══════════════════════════════════════
```

---

# ═══════════════════════════════════════════════════
# SESSÃO 9 — DIA 9: UNIFICAÇÃO DO MOTOR DE IA
# Sprint 0 | Sessão 9 de 14 | Tipo: REFACTOR
# Bloco: B12 + B01 — Padrões + LLMs
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload:
- `src/ai-provider/ai-provider.service.ts`
- `src/ai-provider/types.ts`
- `src/lib/gemini.ts` (primeiras 100 linhas — é muito grande)
- `apps/api/src/adapters/openai/openai.adapter.ts` (criado Sessão 3)
- `.astrum-progress/sprint_0.md`

---

## PROMPT 9A — CRIAR ADAPTER LLM UNIFICADO

### CONTEXTO
O projeto tem 3 SDKs de IA instalados (OpenAI, Anthropic, Google Gemini) com lógica espalhada em
`gemini.ts` (33kb), `gemini.server.ts` (172kb) e `ai-provider/`. Precisamos de um único ponto de
entrada para todas as chamadas de IA, com o Circuit Breaker da Sessão 3 integrado.

**ESTRATÉGIA:** Strangler Fig — criar o novo adapter unificado e redirecionar gradualmente.
Não apagar os arquivos antigos ainda (serão removidos no Sprint 3 quando LangGraph assumir).

### TAREFA 1 — Criar o LLM Adapter Unificado

Crie `apps/api/src/adapters/ai/llm.adapter.ts`:

```typescript
import { callOpenAI, getOpenAICircuitStatus } from '../openai/openai.adapter';

/**
 * LLM Adapter Unificado — ponto central para TODAS as chamadas de IA.
 * 
 * FILOSOFIA STRANGLER FIG:
 * - Novo código usa este adapter (não chama OpenAI/Gemini diretamente)
 * - Código legado (gemini.ts, gemini.server.ts) continua funcionando por ora
 * - Sprint 3 (LangGraph) irá substituir completamente a lógica legada
 * 
 * ROTEAMENTO DE MODELOS:
 * - Mensagens simples (saudações, status) → GPT-4o-mini (barato)
 * - Análise complexa (diagnóstico, churn, manuais) → GPT-4o (preciso)
 * - Embeddings → text-embedding-3-small (sempre)
 */

export type MessageRole = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: MessageRole;
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  systemPrompt?: string;
  tenantId: string;
  context?: 'support' | 'billing' | 'onboarding' | 'analysis';
  forceModel?: 'gpt-4o-mini' | 'gpt-4o'; // override do roteamento automático
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: number;
  fromFallback: boolean;
  routingDecision: 'gpt-4o-mini' | 'gpt-4o';
  latencyMs: number;
}

// Palavras-chave que indicam necessidade do modelo mais capaz
const COMPLEX_KEYWORDS = [
  'diagnóstico', 'técnico', 'olt', 'fibra', 'splitter', 'onu', 'ont',
  'contrato', 'cancelar', 'rescisão', 'churn', 'inadimplente',
  'analisar', 'relatório', 'configurar', 'problema sério',
  'analyze', 'diagnose', 'technical',
];

/**
 * Classifica se uma mensagem precisa do modelo avançado (GPT-4o) 
 * ou se o modelo básico (GPT-4o-mini) é suficiente.
 */
export function classifyMessageComplexity(
  messages: LLMMessage[],
  context?: LLMRequest['context']
): 'gpt-4o-mini' | 'gpt-4o' {
  // Análise e relatórios sempre usam o modelo avançado
  if (context === 'analysis') return 'gpt-4o';

  // Verificar keywords na última mensagem do usuário
  const lastUserMessage = [...messages]
    .reverse()
    .find(m => m.role === 'user')?.content ?? '';
  
  const isComplex = COMPLEX_KEYWORDS.some(keyword =>
    lastUserMessage.toLowerCase().includes(keyword)
  );

  // Mensagens longas (>200 chars) geralmente são mais complexas
  const isLong = lastUserMessage.length > 200;

  return isComplex || isLong ? 'gpt-4o' : 'gpt-4o-mini';
}

/**
 * Função principal do adapter. Use esta em TODO o código novo.
 */
export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const startTime = Date.now();

  // Determinar modelo
  const model = request.forceModel ?? classifyMessageComplexity(
    request.messages,
    request.context
  );

  // Construir messages com system prompt
  const messages: LLMMessage[] = request.systemPrompt
    ? [{ role: 'system', content: request.systemPrompt }, ...request.messages]
    : request.messages;

  // Chamar via Circuit Breaker (definido na Sessão 3)
  const response = await callOpenAI({
    model,
    messages,
    temperature: request.temperature ?? 0.7,
    max_tokens: request.maxTokens ?? 1000,
  });

  return {
    content: response.content,
    model: response.model,
    tokensUsed: response.usage.total_tokens,
    fromFallback: response.fromFallback ?? false,
    routingDecision: model,
    latencyMs: Date.now() - startTime,
  };
}

/**
 * Status do sistema de IA (para health check).
 */
export function getLLMStatus() {
  return {
    openai: getOpenAICircuitStatus(),
    router: 'active',
  };
}
```

### TAREFA 2 — Criar testes do LLM Router

Crie `apps/api/src/adapters/ai/llm.adapter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { classifyMessageComplexity } from './llm.adapter';

describe('LLM Router — Classificação de Complexidade', () => {
  it('saudação simples → gpt-4o-mini', () => {
    const model = classifyMessageComplexity([
      { role: 'user', content: 'Olá, bom dia!' }
    ]);
    expect(model).toBe('gpt-4o-mini');
  });

  it('pergunta sobre OLT → gpt-4o', () => {
    const model = classifyMessageComplexity([
      { role: 'user', content: 'Minha OLT está com alarme de fibra cortada' }
    ]);
    expect(model).toBe('gpt-4o');
  });

  it('contexto de análise → sempre gpt-4o', () => {
    const model = classifyMessageComplexity(
      [{ role: 'user', content: 'status' }],
      'analysis'
    );
    expect(model).toBe('gpt-4o');
  });

  it('mensagem longa (>200 chars) → gpt-4o', () => {
    const longMessage = 'A'.repeat(201);
    const model = classifyMessageComplexity([
      { role: 'user', content: longMessage }
    ]);
    expect(model).toBe('gpt-4o');
  });

  it('pergunta de churn → gpt-4o', () => {
    const model = classifyMessageComplexity([
      { role: 'user', content: 'Quero cancelar meu contrato' }
    ]);
    expect(model).toBe('gpt-4o');
  });

  it('consulta de status → gpt-4o-mini', () => {
    const model = classifyMessageComplexity([
      { role: 'user', content: 'Minha internet está funcionando?' }
    ]);
    expect(model).toBe('gpt-4o-mini');
  });
});
```

### CHECKLIST UPDATE
```
═══════════════════════════════════════
SESSÃO 9 CONCLUÍDA
Sprint: 0 | Dia: 9 | Tipo: REFACTOR
Tarefa: LLM Adapter Unificado + LLM Router
Arquivos criados:
  + apps/api/src/adapters/ai/llm.adapter.ts
  + apps/api/src/adapters/ai/llm.adapter.test.ts
Checklist para atualizar:
  sprint_0.md → Dia 9 → marcar todos os [ ] como [x]
  CHECKLIST_MASTER.md → "LLM Router: GPT-4o-mini para chat, GPT-4o para raciocínio" → Em progresso
Próxima sessão: Sessão 10 — Dia 10 — Migração Express → Fastify
═══════════════════════════════════════
```
