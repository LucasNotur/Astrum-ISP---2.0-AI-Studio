# PARTE 1 — IA-01 a IA-10 — Backend (CRAG, cache, eval, OCR, memory, audit, churn, voz, rede, multi-agente)

> **Para a IA executora (Sonnet):** este documento é o seu roteiro. Ele foi escrito após
> auditoria do código real em 2026-07-04 — todos os caminhos, assinaturas e números de linha
> citados foram verificados. Você NÃO precisa redescobrir a arquitetura: precisa executar.
> Uma sessão por vez, na ordem. Em caso de conflito entre este plano e o código atual,
> o código venceu (algo mudou depois de 2026-07-04) — adapte mantendo a INTENÇÃO da sessão
> e registre o desvio no `PROGRESS_LOG.md`.

---

## §0 — PROTOCOLO (obrigatório, herda o §0 do PLANO_MESTRE_V2.md)

### 0.1 Ritual de início de TODA sessão
1. Ler `.astrum-progress/PLANO_MESTRE_V2.md` §0 inteiro (regras R1–R6 e DoD).
2. Ler as últimas 3 entradas de `.astrum-progress/PROGRESS_LOG.md`.
3. `git status` + `git log --oneline -5`. Se houver trabalho não commitado, resolver antes.
4. Criar branch `feat/ia-XX-<slug>` a partir de `main` atualizado.
5. Localizar a primeira sessão ⬜ NESTE arquivo. Essa é a sessão. Não adiantar sessões.

### 0.2 Regras extras deste plano (além de R1–R6)
- **RN1 — Flag off por default.** TODA capability nova nasce atrás de env flag com default
  desligado, seguindo o padrão de `apps/api/src/infrastructure/config/engine-flags.ts`
  (função `normalize` + leitura de `process.env` sem dependências). Produção não muda de
  comportamento ao mergear — só ao ligar a flag.
- **RN2 — Nada em `/src`.** R4 vale integralmente: todo código destas sessões vai em
  `apps/api/`, `packages/queue/` ou `packages/db/`. Zero arquivos novos em `/src`.
- **RN3 — Modelos (R3).** Grading/classificação/verificação = `gpt-4o-mini`. Geração
  orquestrada/raciocínio = `gpt-4o`. Nunca introduzir modelo novo sem flag.
- **RN4 — Fail-open.** Toda camada nova de IA (cache semântico, grading, visão, decay)
  falha ABERTA: se o serviço cair, o fluxo atual continua como está hoje. O padrão de
  referência é `apps/api/src/infrastructure/memory/zep.service.ts:50-66` (constructor
  checa env, `enabled=false` → no-op com `infraLogger.warn`).
- **RN5 — Migrations.** Próximo número livre verificado em 2026-07-04: **035**
  (`packages/db/src/migrations/034_fix_users_rls_recursion.sql` é a última). ANTES de
  criar migration, rode `ls packages/db/src/migrations/` e use o próximo número real.
  Toda tabela nova tem RLS por `tenant_id` (copiar padrão de `023_shadow_results.sql`).
- **RN6 — Teste primeiro que compila, depois que se comporta.** DoD §0.4 do plano mestre:
  `npx vitest run <arquivos>` verde + typecheck limpo no pacote tocado
  (`cd apps/api && npx tsc --noEmit` — confirme o script real em `apps/api/package.json`).
- **RN7 — Custo.** Toda chamada LLM nova DEVE passar headers Helicone
  (`'Helicone-Property-TenantId'` + `'Helicone-Property-UseCase'`), como já fazem todos os
  métodos de `vercel-ai.service.ts` (ex.: linhas 139-142). UseCase novo = nome da sessão
  (ex.: `crag-grade`, `boleto-ocr`).

### 0.3 Ritual de fim de sessão
1. Critérios de aceite verificados POR COMANDO (colar output no PROGRESS_LOG).
2. Marcar checkboxes desta sessão AQUI.
3. Entrada no `PROGRESS_LOG.md` (data, sessão, arquivos, status, observações).
4. Commit `feat(iaXX): <resumo>`.

---

## §1 — MAPA DO TERRENO (verificado em 2026-07-04, NÃO redescobrir)

| Peça | Arquivo | O que importa |
|---|---|---|
| Estado do agente | `apps/api/src/domain/agent/agent.state.ts` | Zod schema `AgentStateSchema` (linhas 11-63). **Pitfall:** campo novo precisa ser adicionado TAMBÉM nos `channels` do grafo (ver abaixo), senão o LangGraph descarta o patch. |
| Nós do grafo | `apps/api/src/domain/agent/agent.nodes.ts` | 8 nós exportados: `nodeClassify`, `nodeGuardrails`, `nodeDecideSource`, `nodeFetchContext`, `nodeGenerate`, `nodeValidate`, `nodeEscalate`, `nodeBlock`. Fluxo documentado nas linhas 14-39. |
| Grafo compilado | `apps/api/src/domain/agent/langgraph.service.ts` | `buildAgentGraph()` (linhas 29-95): channels manuais (31-57), nós (61-68), edges (71-92). **Pitfall:** `const agentGraph = buildAgentGraph()` na linha 98 é singleton compilado no import — testes que mockam nós usam `vi.mock` ANTES do import (ver como `langgraph.service.test.ts` já faz). |
| LLM service | `apps/api/src/infrastructure/ai/vercel-ai.service.ts` | `model = openai('gpt-4o-mini')`, `heavyModel = openai('gpt-4o')` (117-118). Métodos: `classifyIntent`, `generateNetworkDiagnostic`, `generateTicketReport`, `streamWithTools` (208-240, `stopWhen: stepCountIs(5)`). Prompts em `_buildSystemPrompt` (244-266). Tools em `agentTools` (79-112). |
| Busca híbrida | `apps/api/src/infrastructure/rag/hybrid-search.service.ts` | `search(query, tenantId, options): Promise<HybridSearchResult[]>`; result = `{id, content, filename, score, denseScore, sparseScore, chunk_index}`; `scoreThreshold` default 0.65; HyDE automático. Chamada real no grafo: `agent.nodes.ts:159` com `{ limit: 4, hydeSensitivity: 'auto' }`. |
| Executor de tools | `apps/api/src/infrastructure/ai/tools.executor.ts` | `new ToolsExecutor(tenantId).execute(toolName, args)`. |
| Worker de mensagem | `packages/queue/src/workers/message.worker.ts` | Pipeline: conversa → salva msg → `langGraphService.processMessage` (linhas 52-59, dynamic import) → salva resposta → WS → WhatsApp. `MessageJobData` (13-29) já carrega campos de mídia. |
| Mídia inbound | `apps/api/src/adapters/whatsapp/media-processor.service.ts` | `processInboundMedia(media, tenantId, deps)` puro com deps injetáveis (`MediaDeps`: `transcribeAudio`, `describeImage`, `storeMedia`, `visionEnabled`). Branch de documento nas linhas 85-96 só guarda ref — é onde entra OCR. |
| Voz (FSM pronta) | `apps/api/src/domain/atendimento/voice-call.ts` | Máquina de estados pura já testada: `transition(ctx, ev)`, estados `ringing→greeting→identifying→serving→transferring→ended`, `SELF_SERVE_INTENTS`, `MAX_ID_ATTEMPTS=3`. NÃO reescrever — plugar. |
| Flags | `apps/api/src/infrastructure/config/engine-flags.ts` + `feature-flags.ts` | Padrão a copiar para flags novas. |
| Memória | `apps/api/src/infrastructure/memory/zep.service.ts` + `memory-composer.service.ts` | Zep fail-open; composer monta o contexto. |
| Custo | `apps/api/src/infrastructure/observability/cost-budget.ts` | Orçamento por tenant já existe. |
| Shadow mode | `apps/api/src/domain/atendimento/shadow-mode.ts` + migration `023_shadow_results.sql` | Já grava comparações legacy×v2. |
| Guardrails | `apps/api/src/infrastructure/guardrails/guardrails.pipeline.ts` | `runGuardrails(message, {tenantId})` → `{safe, blockedReason}`. |
| Analytics | `apps/api/src/infrastructure/analytics/duckdb.service.ts`, `etl.service.ts`, `analytics.schema.ts` | Base do feature engineering de churn. |

Ordem de execução e dependências:

```
IA-01 CRAG            (nada depende de fora; MAIOR prioridade)
IA-02 Cache semântico + cascata de modelos   (independente)
IA-03 Eval harness + prompt registry          (independente; pré-req p/ cutover v2)
IA-04 OCR boleto + visão de campo             (independente)
IA-05 Memory decay                            (independente, pequena)
IA-06 Audit trail imutável                    (independente)
IA-07 Churn prediction                        (depende de dados no Supabase; usa IA-06 p/ log)
IA-08 Voz MVP fase A (telefonia)              (grande; depende de IA-01 e IA-03 no ar)
IA-09 CTO failure prediction                  (depende de coleta de métricas — fase de dados primeiro)
IA-10 Multi-agente por domínio                (SÓ depois do cutover ATENDIMENTO_ENGINE=v2)
```

---

# ⬜ IA-01 — Self-RAG / CRAG no grafo existente

**Objetivo:** o agente avalia o contexto recuperado ANTES de gerar (grade), re-busca com
query reescrita se o contexto for ruim (corrective), e verifica a própria resposta contra
as fontes DEPOIS de gerar (self-check), tudo com `gpt-4o-mini` e loop limitado.

**Flag:** `CRAG_ENABLED` (`'true'|'false'`, default `'false'`).

### Arquivos

| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/domain/agent/crag.service.ts` |
| CRIAR | `apps/api/src/domain/agent/crag.service.test.ts` |
| MODIFICAR | `apps/api/src/domain/agent/agent.state.ts` |
| MODIFICAR | `apps/api/src/domain/agent/agent.nodes.ts` (novos nós no fim do arquivo) |
| MODIFICAR | `apps/api/src/domain/agent/langgraph.service.ts` (channels + nós + edges) |
| MODIFICAR | `apps/api/src/domain/agent/langgraph.service.test.ts` (novos caminhos) |

### Passo 1 — Estado

Em `agent.state.ts`, adicionar ao `AgentStateSchema` (depois do bloco "Contexto recuperado",
linha ~37):

```ts
  // CRAG (nós: grade_context, rewrite_query, self_check) — IA-01
  contextGrade: z.enum(['relevant', 'ambiguous', 'irrelevant']).optional(),
  contextConfidence: z.number().min(0).max(1).optional(),
  retrievalAttempts: z.number().default(0),
  rewrittenQuery: z.string().optional(),
  selfCheckPassed: z.boolean().optional(),
  selfCheckIssues: z.array(z.string()).optional(),
  regenerationAttempts: z.number().default(0),
```

### Passo 2 — Serviço CRAG (puro, testável)

`crag.service.ts` — esqueleto completo (ajuste imports conforme o arquivo real):

```ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { infraLogger } from '../../infrastructure/logging/logger';

export function isCragEnabled(): boolean {
  return (process.env.CRAG_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export const ContextGradeSchema = z.object({
  grade: z.enum(['relevant', 'ambiguous', 'irrelevant']),
  confidence: z.number().min(0).max(1),
  missing_info: z.string().max(300).describe('O que falta no contexto para responder'),
});
export type ContextGrade = z.infer<typeof ContextGradeSchema>;

export const SelfCheckSchema = z.object({
  grounded: z.boolean().describe('true se TODAS as afirmações factuais têm suporte nas fontes'),
  unsupported_claims: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
});
export type SelfCheck = z.infer<typeof SelfCheckSchema>;

const grader = openai('gpt-4o-mini'); // RN3: grading é sempre mini

export async function gradeContext(
  query: string, ragContext: string, dbContext: string, tenantId: string,
): Promise<ContextGrade> {
  const { object } = await generateObject({
    model: grader as any,
    schema: ContextGradeSchema,
    system: 'Você avalia se o CONTEXTO recuperado é suficiente para responder a PERGUNTA de um cliente de ISP. Seja rigoroso: contexto genérico ou fora do assunto = irrelevant.',
    messages: [{ role: 'user', content: `PERGUNTA: ${query}\n\nCONTEXTO:\n${ragContext}\n${dbContext}` }],
    headers: { 'Helicone-Property-TenantId': tenantId, 'Helicone-Property-UseCase': 'crag-grade' },
  });
  return object;
}

export async function rewriteQuery(
  query: string, missingInfo: string, tenantId: string,
): Promise<string> {
  const { object } = await generateObject({
    model: grader as any,
    schema: z.object({ rewritten: z.string().max(200) }),
    system: 'Reescreva a pergunta do cliente como uma query de busca técnica de ISP, incorporando a informação que faltou na primeira busca. Responda só a query.',
    messages: [{ role: 'user', content: `Pergunta original: ${query}\nFaltou: ${missingInfo}` }],
    headers: { 'Helicone-Property-TenantId': tenantId, 'Helicone-Property-UseCase': 'crag-rewrite' },
  });
  return object.rewritten;
}

export async function selfCheck(
  response: string, ragContext: string, dbContext: string, tenantId: string,
): Promise<SelfCheck> {
  const { object } = await generateObject({
    model: grader as any,
    schema: SelfCheckSchema,
    system: 'Você verifica se a RESPOSTA de um agente de ISP é sustentada pelas FONTES. Afirmações sobre valores, datas, status de fatura ou procedimentos técnicos sem fonte = unsupported. Cortesia/saudação não conta como claim.',
    messages: [{ role: 'user', content: `RESPOSTA:\n${response}\n\nFONTES:\n${ragContext}\n${dbContext}` }],
    headers: { 'Helicone-Property-TenantId': tenantId, 'Helicone-Property-UseCase': 'crag-selfcheck' },
  });
  return object;
}
```

**Fail-open (RN4):** cada função é chamada pelos nós dentro de `try/catch`; no catch,
retornar o caminho permissivo (`grade='relevant'` / `grounded=true`) e logar `warn`.

### Passo 3 — Nós novos em `agent.nodes.ts`

Adicionar ao FIM do arquivo três nós. Regras de negócio exatas:

```ts
// ─── Nó 9 (CRAG): Grade Context ─────────────────────────────────────────────
export async function nodeGradeContext(state: AgentState): Promise<Partial<AgentState>> {
  // Sem contexto para avaliar (dataSource none) → segue direto
  if (!state.ragContext && !state.dbContext) {
    return { contextGrade: 'relevant', contextConfidence: 1, steps: [...state.steps, 'grade_context'] };
  }
  try {
    const g = await gradeContext(state.userMessage, state.ragContext ?? '', state.dbContext ?? '', state.tenantId);
    infraLogger.info({ step: 'grade_context', grade: g.grade, confidence: g.confidence, attempt: state.retrievalAttempts }, 'Agent: CRAG grade');
    return {
      contextGrade: g.grade,
      contextConfidence: g.confidence,
      rewrittenQuery: g.grade !== 'relevant' ? undefined : state.rewrittenQuery,
      steps: [...state.steps, 'grade_context'],
    };
  } catch (err) {
    infraLogger.warn({ err }, 'CRAG grade failed — fail-open');
    return { contextGrade: 'relevant', contextConfidence: 0, steps: [...state.steps, 'grade_context'] };
  }
}

// ─── Nó 10 (CRAG): Rewrite Query ────────────────────────────────────────────
export async function nodeRewriteQuery(state: AgentState): Promise<Partial<AgentState>> {
  let rewritten = state.userMessage;
  try {
    rewritten = await rewriteQuery(state.userMessage, 'contexto anterior insuficiente', state.tenantId);
  } catch { /* fail-open: re-busca com a query original */ }
  infraLogger.info({ step: 'rewrite_query', rewritten: rewritten.slice(0, 80) }, 'Agent: CRAG rewrite');
  return {
    rewrittenQuery: rewritten,
    retrievalAttempts: state.retrievalAttempts + 1,
    steps: [...state.steps, 'rewrite_query'],
  };
}

// ─── Nó 11 (CRAG): Self Check ───────────────────────────────────────────────
export async function nodeSelfCheck(state: AgentState): Promise<Partial<AgentState>> {
  if (!state.response) return { selfCheckPassed: false, steps: [...state.steps, 'self_check'] };
  try {
    const check = await selfCheck(state.response, state.ragContext ?? '', state.dbContext ?? '', state.tenantId);
    infraLogger.info({ step: 'self_check', grounded: check.grounded, issues: check.unsupported_claims.length }, 'Agent: CRAG self-check');
    return {
      selfCheckPassed: check.grounded,
      selfCheckIssues: check.unsupported_claims,
      steps: [...state.steps, 'self_check'],
    };
  } catch (err) {
    infraLogger.warn({ err }, 'CRAG self-check failed — fail-open');
    return { selfCheckPassed: true, steps: [...state.steps, 'self_check'] };
  }
}
```

E modificar `nodeFetchContext` (linha 148): usar `state.rewrittenQuery ?? state.userMessage`
como query da busca híbrida (linha 159) — mudança de 1 linha:

```ts
const searchQuery = state.rewrittenQuery ?? userMessage;
// ...
.search(searchQuery, tenantId, { limit: 4, hydeSensitivity: 'auto' })
```

### Passo 4 — Grafo (`langgraph.service.ts`)

1. **Channels** (bloco 31-57) — adicionar (SEM isso o estado novo é descartado):
```ts
      contextGrade: { value: (x, y) => y ?? x },
      contextConfidence: { value: (x, y) => y ?? x },
      retrievalAttempts: { value: (x, y) => y ?? x, default: () => 0 },
      rewrittenQuery: { value: (x, y) => y ?? x },
      selfCheckPassed: { value: (x, y) => y ?? x },
      selfCheckIssues: { value: (x, y) => y ?? x },
      regenerationAttempts: { value: (x, y) => y ?? x, default: () => 0 },
```
2. **Nós:** `graph.addNode('grade_context' | 'rewrite_query' | 'self_check', ...)`.
3. **Edges — com flag ligada** (`isCragEnabled()` avaliado DENTRO das conditional edges,
   para o singleton da linha 98 não congelar a flag no import):
   - Remover o edge fixo `fetch_context → generate` (linha 74) e trocar por:
   ```ts
   graph.addEdge('fetch_context' as any, 'grade_context' as any);
   graph.addConditionalEdges('grade_context' as any, (state: AgentState) => {
     if (!isCragEnabled()) return 'generate';
     if (state.contextGrade === 'relevant') return 'generate';
     if (state.retrievalAttempts >= 1) return 'generate'; // máx 1 loop corretivo
     return 'rewrite_query';
   });
   graph.addEdge('rewrite_query' as any, 'fetch_context' as any);
   ```
   - Remover o edge fixo `generate → validate` (linha 75) e trocar por:
   ```ts
   graph.addEdge('generate' as any, 'self_check' as any);
   graph.addConditionalEdges('self_check' as any, (state: AgentState) => {
     if (!isCragEnabled()) return 'validate';
     if (state.selfCheckPassed) return 'validate';
     return 'escalate'; // resposta não-fundamentada NUNCA vai pro cliente
   });
   ```
   Com `CRAG_ENABLED=false` o fluxo passa pelos nós `grade_context`/`self_check` mas eles
   viram pass-through baratos? **NÃO** — para custo zero com flag off, os nós devem
   short-circuit: primeira linha de `nodeGradeContext` e `nodeSelfCheck`:
   `if (!isCragEnabled()) return { steps: [...state.steps, '<nome>'] };` (nenhuma chamada LLM).

### Passo 5 — Testes (mínimo)

`crag.service.test.ts`: mockar `ai.generateObject` com `vi.mock('ai', ...)`;
casos: (a) grade relevante; (b) grade irrelevante; (c) selfCheck com claim não suportada;
(d) exceção → funções chamadoras fail-open (testar via nós).

`langgraph.service.test.ts` (seguir o padrão de mock que o arquivo JÁ usa): novos caminhos:
- flag off → `steps` não contém chamada LLM de CRAG e resposta sai igual a hoje;
- flag on + grade `irrelevant` → steps contêm `rewrite_query` e `fetch_context` 2×, e o
  2º fetch usou `rewrittenQuery`;
- flag on + selfCheck reprova → fluxo termina em `escalate` (ticket criado);
- loop nunca excede 1 rewrite (grade irrelevante 2× → gera mesmo assim).

```powershell
cd apps/api; npx vitest run src/domain/agent
```

### Critérios de aceite
- [ ] `CRAG_ENABLED=false` (default): comportamento e nº de chamadas LLM idênticos aos de hoje (provar por teste com spy no mock de `ai`).
- [ ] Flag on: contexto ruim dispara exatamente 1 re-busca com query reescrita.
- [ ] Flag on: resposta não-fundamentada vai para `escalate`, nunca para o cliente.
- [ ] Logs `Agent: CRAG grade|rewrite|self-check` com `tenantId` presentes.
- [ ] Typecheck + suíte `src/domain/agent` verde.

**Rollback:** `CRAG_ENABLED=false` (nenhum deploy necessário).
**Commit:** `feat(ia01): CRAG — grade/rewrite/self-check no grafo do agente (flag off)`.

---

# ⬜ IA-02 — Cache semântico + cascata de modelos

**Objetivo:** (a) perguntas técnicas recorrentes respondidas do cache Redis por similaridade
de embedding (custo ~0, latência ms); (b) intents conversacionais gerados com `gpt-4o-mini`
em vez de `gpt-4o` (hoje `streamWithTools` usa SEMPRE `heavyModel`, linha 215).

**Flags:** `SEMANTIC_CACHE_ENABLED` (default `false`), `MODEL_CASCADE_ENABLED` (default `false`).

### Arquivos
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/cache/semantic-cache.service.ts` (+ `.test.ts`) |
| MODIFICAR | `apps/api/src/infrastructure/ai/vercel-ai.service.ts` (param opcional de modelo) |
| MODIFICAR | `apps/api/src/domain/agent/agent.nodes.ts` (`nodeGenerate`) |

### Regras de negócio (exatas — não improvisar)
1. **Só cachear resposta impessoal.** Elegível ⇔ `dataSource === 'qdrant'` E
   `dbContext` vazio E `toolsExecuted.length === 0`. NUNCA cachear resposta que usou
   dados do cliente (fatura, plano, nome) — vazamento entre clientes do mesmo tenant.
2. **Chave:** `semcache:{tenantId}` (Redis SCAN por tenant p/ invalidation); valor: JSON
   `{embedding: number[], query, response, createdAt}`. TTL 24h (`EX 86400`).
3. **Similaridade:** cosseno ≥ **0.95** (embedding `text-embedding-3-small`, mesmo modelo
   da `hybrid-search.service.ts:46`). Implementar cosseno em TS puro (não puxar lib).
4. **Armazenamento MVP:** lista Redis por tenant com no máx. 200 entradas (LPUSH+LTRIM);
   busca linear em memória após `LRANGE` (200 × 1536 floats é barato). Otimizar depois.
5. **Cascata:** em `streamWithTools`, adicionar parâmetro opcional
   `opts?: { tier?: 'mini' | 'full' }` → `tier==='mini'` usa `this.model`, senão
   `this.heavyModel` (default atual). `nodeGenerate` decide:
   `tier = (intent === 'other' || dataSource === 'none') ? 'mini' : 'full'` quando
   `MODEL_CASCADE_ENABLED=true` (R3: conversação=mini, raciocínio=4o).
6. **Integração no `nodeGenerate`:** antes do `streamWithTools` → tentar cache (se flag on
   e elegível pelo `dataSource`); hit → retornar
   `{ response: cached, steps: [...state.steps, 'generate:cache_hit'] }` sem chamar LLM.
   Após gerar com sucesso e ser elegível → gravar no cache (fire-and-forget, `.catch` logando warn).
7. **Fail-open (RN4):** Redis fora → seguir sem cache. Usar o client existente de
   `apps/api/src/infrastructure/cache/redis.client.ts`.

### Testes
- Cosseno: vetores idênticos=1, ortogonais=0.
- Hit acima do threshold retorna cache; 0.94 não retorna.
- Resposta com `dbContext` preenchido NUNCA é gravada (teste com spy no redis mock).
- Flag off → zero interação com Redis.
- Cascata: intent `other` → modelo mini foi selecionado (spy no streamText mock).

### Critérios de aceite
- [ ] Flags off = comportamento atual byte a byte.
- [ ] Teste prova a regra de elegibilidade (nunca cachear dado pessoal).
- [ ] Log `semantic-cache hit` com `tenantId` e score.
- [ ] Suíte `apps/api` verde + typecheck.

**Rollback:** flags off. **Commit:** `feat(ia02): cache semântico + cascata mini/full (flags off)`.

---

# ⬜ IA-03 — Eval harness + prompt registry (pré-requisito do cutover v2)

**Objetivo:** (a) suite de cenários que roda o grafo com LLM mockado E um modo online com
LLM-as-judge; (b) prompts versionados em um registry único com hash, rastreável no Helicone.

### Arquivos
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/ai/prompt-registry.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/eval/scenarios/atendimento.jsonl` (50 cenários) |
| CRIAR | `apps/api/eval/run-eval.ts` + `apps/api/eval/judge.ts` |
| MODIFICAR | `apps/api/src/infrastructure/ai/vercel-ai.service.ts` (consumir registry) |
| MODIFICAR | `apps/api/package.json` (script `eval:agent`) |

### Passo 1 — Prompt registry
Extrair os prompts hardcoded de `_buildSystemPrompt` (`vercel-ai.service.ts:244-266`) para:

```ts
// prompt-registry.ts
export interface PromptVersion { id: string; version: string; text: string; }
// hash sha256 truncado (12 chars) calculado no build do objeto — muda o texto, muda o hash
export function getPrompt(id: 'chat'|'classification'|'technical_diagnostic'|'ticket_report'): PromptVersion;
export function promptHash(text: string): string; // crypto.createHash('sha256')...slice(0,12)
```

`_buildSystemPrompt` passa a delegar ao registry, e TODA chamada LLM ganha header extra
`'Helicone-Property-PromptVersion': version` — assim dá para correlacionar regressão↔prompt.
Manter os textos EXATAMENTE iguais aos atuais nesta sessão (mudança de prompt = sessão própria).

### Passo 2 — Cenários
`atendimento.jsonl` — 1 JSON por linha:
```json
{"id":"bill-001","userMessage":"quanto tô devendo?","intent_expected":"support_billing","must_contain":[],"must_not_contain":["não tenho acesso"],"requires_human_expected":false}
```
Cobrir: 10 billing, 10 técnico, 5 cancelamento, 5 conversacional, 5 injection/PII
(guardrail DEVE bloquear), 5 escalação, 10 edge (áudio transcrito, boleto, mídia).

### Passo 3 — Runner
`run-eval.ts`: lê o JSONL, roda `langGraphService.processMessage` por cenário, avalia
asserts determinísticos (intent, contains, requiresHuman) e — com `EVAL_JUDGE=true` —
chama `judge.ts` (generateObject, `gpt-4o-mini`, schema `{score_1a5, rationale}`).
Saída: tabela no stdout + `eval/results/<timestamp>.json`. Exit code 1 se pass-rate < 90%.
Script: `"eval:agent": "tsx eval/run-eval.ts"` (confirmar se o pacote usa `tsx` ou `ts-node`
nos scripts existentes e seguir o padrão).

### Critérios de aceite
- [ ] Textos de prompt inalterados (diff mostra só mudança de local) + hash estável testado.
- [ ] `PromptVersion` presente nos headers de todas as chamadas do `vercel-ai.service`.
- [ ] `pnpm --filter <api> eval:agent` roda os 50 cenários no modo mock e imprime pass-rate.
- [ ] Documentado no README do eval: rodar com judge exige `OPENAI_API_KEY` + `EVAL_JUDGE=true`.

**Commit:** `feat(ia03): prompt registry versionado + eval harness de 50 cenários`.

---

# ⬜ IA-04 — OCR de boleto + visão técnica de campo

**Objetivo:** (a) documento PDF/imagem de boleto no WhatsApp vira dados estruturados
(linha digitável, valor, vencimento) no contexto do agente; (b) técnico manda foto de
CTO/roteador/fibra e recebe classificação + ação sugerida.

**Flag:** `VISION_STRUCTURED_ENABLED` (default `false`).

### Arquivos
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/vision/vision.service.ts` (+ `.test.ts`) |
| MODIFICAR | `apps/api/src/adapters/whatsapp/media-processor.service.ts` |
| MODIFICAR | `packages/queue/src/workers/message.worker.ts` (wiring dos novos deps) |
| CRIAR | `apps/api/src/domain/ia/vision.routes.ts` (POST /vision/diagnose p/ técnicos) |

### Schemas (usar `generateObject`, modelo `gpt-4o` — visão exige o full)

```ts
export const BoletoSchema = z.object({
  linha_digitavel: z.string().regex(/^\d{47,48}$/).optional(),
  valor_cents: z.number().int().optional(),        // SEMPRE centavos (padrão do repo)
  vencimento: z.string().optional(),                // ISO yyyy-mm-dd
  beneficiario: z.string().max(120).optional(),
  is_boleto: z.boolean(),                           // false → não era boleto, ignorar
  confidence: z.number().min(0).max(1),
});

export const FieldPhotoSchema = z.object({
  equipment: z.enum(['cto', 'roteador', 'onu', 'cabo_fibra', 'poste', 'outro']),
  issue: z.enum(['fibra_rompida', 'led_vermelho', 'conector_sujo', 'sem_problema_visivel',
                 'queimado', 'agua_umidade', 'outro']),
  severity: z.enum(['baixa', 'media', 'alta', 'critica']),
  recommended_action: z.string().max(300),
  confidence: z.number().min(0).max(1),
});
```

`vision.service.ts` expõe `extractBoleto(imageOrPdfUrl, tenantId)` e
`classifyFieldPhoto(imageUrl, tenantId)`; headers Helicone `boleto-ocr` / `field-photo`.
Confidence < 0.6 → retornar null (fail-open: cai no comportamento atual de "documento anexado").

### Integração no media-processor
`MediaDeps` ganha dois deps opcionais: `extractBoleto?`, `classifyFieldPhoto?`.
- Branch **documento** (linhas 85-96): se mime ∈ {`application/pdf`,`image/*`} e
  `extractBoleto` presente → tentar OCR; `is_boleto && confidence≥0.6` → `systemPromptExtension`:
  `Boleto anexado pelo cliente: valor R$X, vencimento Y, linha digitável Z. Compare com as faturas em aberto antes de responder.`
- Branch **imagem** (linhas 70-82): manter `describeImage` como está; `classifyFieldPhoto`
  é usado SÓ pela rota de técnicos (não no fluxo do cliente, para não classificar
  foto de comprovante como "poste").
- `message.worker.ts`: onde os deps atuais são construídos (procurar o call-site de
  `processInboundMedia` no worker — se o wiring estiver em outro arquivo, seguir o real),
  injetar os novos deps condicionados à flag.

### Rota de técnicos
`POST /api/ia/vision/diagnose` body `{image_url}` → `classifyFieldPhoto` → 200 com o objeto.
Autenticação: mesmo decorator/middleware das rotas irmãs em `domain/ia/*.routes.ts`
(copiar de `rag.routes.ts`). Registrar a rota onde as irmãs são registradas (ver `domain/ia/index.ts`).

### Testes
- media-processor: boleto válido → extension com valor/vencimento; `is_boleto=false` →
  comportamento atual intacto; dep ausente/flag off → comportamento atual intacto;
  OCR lança → fail-open.
- vision.service: mock de `ai`; regex da linha digitável; confidence gate.

### Critérios de aceite
- [ ] Flag off → nenhum comportamento novo (teste).
- [ ] PDF de boleto (fixture base64 pequena) gera `systemPromptExtension` com valor em centavos.
- [ ] Rota de técnico responde 200 com schema válido e 401 sem auth.
- [ ] Vitest + typecheck verdes.

**Commit:** `feat(ia04): OCR de boleto + classificação de foto de campo (flag off)`.

---

# ⬜ IA-05 — Memory decay no composer

**Objetivo:** fatos antigos/irrelevantes do Zep deixam de poluir o contexto: peso
`e^(-idadeDias/90)`, corte em 0.2, máx. 10 fatos, sempre em ordem de peso.

### Arquivos
| Ação | Arquivo |
|---|---|
| CRIAR | `apps/api/src/infrastructure/memory/memory-decay.ts` (+ `.test.ts`) — função PURA |
| MODIFICAR | `apps/api/src/infrastructure/memory/memory-composer.service.ts` |

```ts
// memory-decay.ts
export interface DecayableFact { text: string; lastSeen: string /* ISO */; }
export function applyDecay<T extends DecayableFact>(
  facts: T[], now: Date, halfLifeDays = 90, minWeight = 0.2, maxFacts = 10,
): T[] {
  return facts
    .map(f => ({ f, w: Math.exp(-Math.max(0, (now.getTime() - new Date(f.lastSeen).getTime()) / 86_400_000) / halfLifeDays) }))
    .filter(x => x.w >= minWeight)
    .sort((a, b) => b.w - a.w)
    .slice(0, maxFacts)
    .map(x => x.f);
}
```

No composer: aplicar sobre `relevantFacts`/`entities` vindos do `ZepMemoryContext`
(`zep.service.ts:36-48` — `ZepEntity.lastSeen` já existe). Fato sem `lastSeen` → tratar
como recente (peso 1). Sem flag: é filtro determinístico e conservador, mas se o composer
for usado em produção hoje, proteger com `MEMORY_DECAY_ENABLED` default `false` mesmo assim.

**Testes:** fato de hoje passa; 90 dias ≈ 0.37 passa; 200 dias < 0.2 cai; ordena; trunca em 10; `lastSeen` ausente = peso 1.

- [ ] Função pura 100% coberta; composer usa; flag off = passthrough.

**Commit:** `feat(ia05): decay exponencial de memórias no composer (flag off)`.

---

# ⬜ IA-06 — Audit trail imutável de decisões de IA

**Objetivo:** toda passada do grafo gera um registro append-only com hash-chain por tenant
(LGPD/ANATEL, venda enterprise). UPDATE/DELETE bloqueados no banco.

### Arquivos
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/035_ai_decision_log.sql` (confirmar número — RN5) |
| CRIAR | `apps/api/src/infrastructure/audit/ai-audit.service.ts` (+ `.test.ts`) |
| MODIFICAR | `apps/api/src/domain/agent/langgraph.service.ts` (gravar no fim de `processMessage`) |

### Migration (esqueleto)
```sql
CREATE TABLE ai_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  conversation_id uuid,
  customer_id uuid,
  decision_type text NOT NULL,           -- 'agent_response' | 'escalation' | 'tool_call' | 'block'
  payload jsonb NOT NULL,                -- steps, intent, tools, validation, selfCheck
  prompt_version text,                   -- vem do registry da IA-03
  prev_hash text NOT NULL,               -- hash do registro anterior DO MESMO TENANT ('genesis' no 1º)
  hash text NOT NULL,                    -- sha256(prev_hash || payload::text || created_at)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_decision_log_tenant_created ON ai_decision_log (tenant_id, created_at DESC);
-- Imutabilidade:
CREATE RULE ai_decision_log_no_update AS ON UPDATE TO ai_decision_log DO INSTEAD NOTHING;
CREATE RULE ai_decision_log_no_delete AS ON DELETE TO ai_decision_log DO INSTEAD NOTHING;
-- RLS por tenant_id: copiar padrão de 023_shadow_results.sql
```

### Serviço
`recordDecision({tenantId, conversationId, customerId, decisionType, payload, promptVersion})`:
1. `SELECT hash FROM ai_decision_log WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1` (ou 'genesis').
2. `hash = sha256(prevHash + JSON.stringify(payload) + createdAtISO)` (crypto nativo).
3. INSERT. **Fail-open + fire-and-forget:** falha loga `error` no Sentry mas NÃO quebra a resposta ao cliente.
4. `verifyChain(tenantId, limit=1000)`: re-percorre e reporta primeiro elo inválido (usado em teste e em endpoint admin futuro).

Integração: no `processMessage` (`langgraph.service.ts:127-154`), após obter `finalState`,
chamar `recordDecision` com `decisionType` derivado (`requiresHuman→'escalation'`, steps
contém `block`→`'block'`, senão `'agent_response'`). Flag `AI_AUDIT_ENABLED` default `false`.

**Nota de concorrência:** duas escritas simultâneas do mesmo tenant podem ler o mesmo
`prev_hash` (fork da corrente). Aceito no MVP — `verifyChain` trata empate por `created_at`
e o objetivo é tamper-evidence, não consenso. Documentar isso no comentário do serviço.

### Testes
- Cadeia de 3 registros verifica; adulterar payload do 2º → `verifyChain` acusa.
- Falha de INSERT não propaga exceção ao `processMessage` (mock supabase rejeitando).

- [ ] Migration aplicada em staging (`npm run db:migrate` — confirmar script) + tentativa de UPDATE não altera linha.
- [ ] Flag on: passada do grafo gera 1 registro com hash encadeado.

**Commit:** `feat(ia06): audit trail imutável (hash-chain) de decisões de IA (flag off)`.

---

# ⬜ IA-07 — Churn prediction (fase 1: features + score heurístico servido)

**Objetivo:** score de churn 0-100 por cliente, recalculado toda noite, exposto por rota e
gravado em tabela. Fase 1 usa modelo LINEAR interpretável (pesos fixos auditáveis); o
XGBoost entra na fase 2 quando houver ≥ 6 meses de labels (cancelamentos) no Supabase.
Não pular para ML sem baseline — o baseline JÁ entrega a lista de retenção.

### Arquivos
| Ação | Arquivo |
|---|---|
| CRIAR | `packages/db/src/migrations/036_churn_scores.sql` (número real: RN5) |
| CRIAR | `apps/api/src/domain/ml/churn-features.service.ts` (+ `.test.ts`) |
| CRIAR | `apps/api/src/domain/ml/churn-score.ts` (+ `.test.ts`) — PURO |
| CRIAR | `packages/queue/src/workers/churn.worker.ts` (job repeatable 03:00 BRT) |
| CRIAR | `apps/api/src/domain/ia/churn.routes.ts` (GET lista de risco) |

### Migration
```sql
CREATE TABLE churn_scores (
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  score numeric(5,2) NOT NULL,           -- 0..100
  risk_band text NOT NULL,               -- 'low' | 'medium' | 'high' | 'critical'
  features jsonb NOT NULL,               -- snapshot das features usadas (auditável)
  model_version text NOT NULL,           -- 'heuristic-v1'
  scored_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, customer_id, scored_at)
);
-- + RLS padrão por tenant_id
```

### Features (1 query por tenant, `churn-features.service.ts`)
Por cliente ativo: `tenure_days`, `overdue_count_90d`, `avg_payment_delay_days_180d`,
`tickets_30d`, `tickets_90d`, `negative_sentiment_ratio_90d` (de `messages.metadata` /
`ai_performance_logs` — verificar onde sentimento é persistido; se não for, usar 0 e
registrar TODO), `downgrades_180d`, `mrr_cents`. Tabelas: `customers`, `invoices`,
`tickets`, `conversations`/`messages` — confirmar colunas reais em
`packages/db/src/migrations/` antes de escrever a query.

### Score (puro, `churn-score.ts`)
```
score = clamp(0..100,
    25 * min(overdue_count_90d / 3, 1)
  + 20 * min(avg_payment_delay_days_180d / 15, 1)
  + 20 * min(tickets_90d / 5, 1)
  + 15 * negative_sentiment_ratio_90d
  + 10 * downgrades_180d>0 ? 1 : 0
  + 10 * (tenure_days < 90 ? 1 : 0))
band: <25 low | <50 medium | <75 high | >=75 critical
```
Pesos como constantes exportadas com comentário — vira feature importance de fase 2.

### Worker
Padrão dos irmãos em `packages/queue/src/workers/` (imports relativos p/ apps/api,
`setupDLQ`, `addSentryToWorker` — copiar de `cobrai.worker.ts`). Repeatable job cron
`0 3 * * *` timezone America/Sao_Paulo. Flag `CHURN_ENGINE=off|on` default `off` no boot
(padrão `shouldBootWorker` de engine-flags — adicionar domínio ou flag própria simples).

### Rota
`GET /api/ia/churn?band=high` → últimos scores por cliente (DISTINCT ON customer_id,
scored_at DESC), auth igual às rotas irmãs de `domain/ia/`.

### Critérios de aceite
- [ ] `churn-score.ts` 100% coberto (bandas, clamps, casos extremos).
- [ ] Worker roda 1 tenant de staging e insere N linhas (colar contagem no PROGRESS_LOG).
- [ ] Reexecução no mesmo dia não explode PK (scored_at diferente) e rota retorna só o mais recente.
- [ ] Flag off → worker não sobe (log padrão engine-flags).

**Commit:** `feat(ia07): churn score v1 (features + heurística auditável + worker noturno)`.

---

# ⬜ IA-08 — Voz MVP fase A (telefonia + OpenAI Realtime)

**Grande (multi-sessão). Executar SÓ com IA-01 e IA-03 concluídas.** Dividir em A1/A2/A3;
cada uma com commit próprio. A FSM `voice-call.ts` JÁ EXISTE e é a fonte de verdade do fluxo.

**Flag:** `VOICE_ENGINE=off|mvp` (default `off`). Envs novas (adicionar ao
`env.validator.ts` como opcionais): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_PHONE_NUMBER`, `OPENAI_REALTIME_MODEL` (default `gpt-realtime-mini` — validar
nome vigente na doc da OpenAI ANTES de codar; se indisponível, fallback documentado:
pipeline Twilio `<Gather>`+Whisper+TTS, mais lento porém estável).

### A1 — Webhook + TwiML (sem áudio streaming ainda)
- CRIAR `apps/api/src/adapters/telephony/twilio-webhook.routes.ts`:
  `POST /telephony/voice/incoming` valida assinatura Twilio (`X-Twilio-Signature`, HMAC —
  reusar `infrastructure/security/hmac.service.ts` se compatível, senão util local),
  resolve tenant pelo número chamado, responde TwiML `<Connect><Stream url="wss://..."/>`.
  Fora do horário comercial → TwiML `<Say>` de indisponibilidade (usa
  `initialCall(withinBusinessHours)` + `transition(ctx,{type:'answer'})` da FSM).
- Teste: assinatura inválida → 403; fora de horário → TwiML contém `<Say>`.

### A2 — Bridge de áudio
- CRIAR `apps/api/src/adapters/telephony/realtime-bridge.service.ts`:
  WS Twilio Media Streams (μ-law 8kHz base64, eventos `start|media|stop`) ↔ WS OpenAI
  Realtime (PCM16 24kHz). Conversão μ-law→PCM16 + resample 8k→24k em TS puro (tabela
  μ-law de 256 entradas + interpolação linear; SEM dependência nativa). Instructions da
  sessão Realtime vêm do prompt-registry (IA-03) id `voice_greeting` (novo).
- Eventos da FSM: cada turno do Realtime mapeia para `CallEvent` e avança `transition()`;
  estado `transferring` → TwiML redirect para fila humana (número em env).
- Teste: conversor μ-law→PCM com fixture de 1 frame conhecido; FSM dirigida por eventos
  simulados percorre `ringing→greeting→identifying→serving→ended`.

### A3 — Tools na voz
- Identificação: CPF por DTMF ou fala → tool `identify_customer` (lookup Supabase por
  cpf/telefone) → evento `identified`/`identify_failed` (a FSM já limita a 3 tentativas).
- Reusar `ToolsExecutor` para `check_invoice` e `create_ticket` (segunda via/agendamento =
  `SELF_SERVE_INTENTS` da FSM). Transcrição completa da chamada → `recordDecision`
  (IA-06) com `decision_type='voice_call'` + PII mascarada pelo
  `guardrails/pii-detector.service.ts` antes de persistir.

### Critérios de aceite (fase A completa)
- [ ] Ligação real em staging: IA atende, identifica cliente seed, informa fatura em aberto e encerra.
- [ ] `identify_failed` 3× transfere para humano (log da FSM).
- [ ] Fora do horário → mensagem e desligamento.
- [ ] `VOICE_ENGINE=off` → rota responde 404/desabilitado.

**Commits:** `feat(ia08a): webhook Twilio + TwiML`, `feat(ia08b): bridge áudio Realtime`,
`feat(ia08c): tools e identificação na voz`.

---

# ⬜ IA-09 — CTO failure prediction (fase 0: coleta)

**Sem dados de telemetria não há modelo.** Esta sessão SÓ constrói a coleta; o modelo
(Isolation Forest / sazonalidade) é sessão futura quando houver ≥ 30 dias de métricas.

- CRIAR migration `03X_network_metrics.sql`: `network_metrics(tenant_id, cto_id → network_ctos,
  metric text CHECK IN ('latency_ms','packet_loss_pct','signal_dbm','clients_online'),
  value numeric, collected_at timestamptz)`, índice `(tenant_id, cto_id, metric, collected_at DESC)`,
  RLS padrão. Avaliar particionamento mensal se volume > 1M linhas/mês (documentar decisão).
- CRIAR `apps/api/src/domain/rede/metrics-ingest.routes.ts`: `POST /api/rede/metrics`
  (batch de até 500 pontos, validação zod, auth por API key de tenant — seguir o padrão
  de auth máquina-máquina existente; se não houver, usar o decorator de auth atual e anotar TODO).
- CRIAR alerta ingênuo (já útil): worker 15/15min marca CTO com `packet_loss_pct` médio
  > 5% na última hora → cria ticket `[REDE] Perda de pacotes na CTO X` (dedupe: não abrir
  se já existe ticket aberto da mesma CTO com o mesmo título).

- [ ] Ingestão de 500 pontos < 2s em staging; RLS testada (tenant A não lê B).
- [ ] Alerta dispara com fixture e NÃO duplica ticket.

**Commit:** `feat(ia09): coleta de métricas de rede + alerta de perda de pacotes`.

---

# ⬜ IA-10 — Multi-agente por domínio (GATED)

**NÃO EXECUTAR antes de `ATENDIMENTO_ENGINE=v2` estar em produção estável (pós-S74/S82).**
Registro de design para quando chegar a hora: supervisor LangGraph roteando para subgrafos
`atendimento` (o grafo atual), `cobranca` (tools de fatura/negociação com política do
`cobrai-rules.service.ts`) e `retencao` (gatilhado por `churn_scores.risk_band='critical'`
da IA-07). Handoff = edge condicional por intent, estado compartilhado mínimo
(tenantId/customerId/conversationId + resumo). Sem A2A externo no MVP — é 1 processo.
Quando abrir a sessão, reavaliar contra o estado do repo e escrever plano próprio.

---

## APÊNDICE A — Comandos de verificação padrão

```powershell
# typecheck do pacote tocado
cd apps/api; npx tsc --noEmit
# testes da sessão (exemplos)
cd apps/api; npx vitest run src/domain/agent
cd apps/api; npx vitest run src/infrastructure/cache/semantic-cache.service.test.ts
# suíte inteira antes do commit final da sessão
npx vitest run
```

## APÊNDICE B — Armadilhas conhecidas (li o código por você)

1. **Channels do LangGraph:** patch de campo sem channel declarado é DESCARTADO
   silenciosamente (`langgraph.service.ts:31-57`). Todo campo novo de estado = schema zod
   + channel.
2. **Singleton do grafo:** `agentGraph` compila no import (linha 98). Flags lidas fora das
   conditional edges congelam no boot. Ler flag DENTRO do edge/nó.
3. **`streamWithTools` para em 5 steps** (`stopWhen: stepCountIs(5)`) — loops de tool novos
   contam nesse teto.
4. **Valores monetários SEMPRE em centavos** (`amount_cents`, `Math.round` — regra do ETL
   S69). O OCR de boleto (IA-04) segue isso.
5. **`audit_log` (tabela legada, migration 007) ≠ `ai_decision_log` (IA-06)** — armadilha
   de nome já documentada no plano mestre S69 ("NUNCA para audit_log").
6. **Workers importam de `apps/api` por caminho relativo** (`message.worker.ts:2-11`).
   Feio, mas é o padrão vigente — siga-o no `churn.worker.ts`, não invente alias.
7. **PostgREST e NULL:** `.eq('col', null)` não casa NULL — use `.is('col', null)`
   (bug já corrigido na S68; não reintroduzir em queries novas).
8. **`zod` no repo é v4 e `ai` SDK é v6** (commit d091510) — conferir a API vigente antes
   de copiar exemplos antigos de generateObject/streamText da internet.
