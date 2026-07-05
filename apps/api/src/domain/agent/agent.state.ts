import { z } from 'zod';

/**
 * Estado do Agente LangGraph
 *
 * O estado é passado de nó em nó no grafo.
 * Cada nó lê o estado, executa sua lógica, e retorna
 * um patch (atualização parcial) do estado.
 */

export const AgentStateSchema = z.object({
  // Input original
  tenantId: z.string(),
  customerId: z.string(),
  conversationId: z.string(),
  userMessage: z.string(),

  // Classificação (nó: classify)
  intent: z.enum([
    'support_technical', 'support_billing', 'upgrade_plan',
    'cancel_service', 'check_status', 'complaint', 'other'
  ]).optional(),
  urgency: z.enum(['low', 'normal', 'high']).optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'frustrated']).optional(),

  // Guardrails (nó: guardrails)
  guardPassed: z.boolean().optional(),
  guardReason: z.string().optional(),

  // Decisão de fonte (nó: decide_source) — Agentic RAG
  dataSource: z.enum(['qdrant', 'supabase', 'both', 'none']).optional(),
  sourceReason: z.string().optional(),

  // Contexto recuperado
  ragContext: z.string().optional(),
  dbContext: z.string().optional(),
  zepContext: z.string().optional(),

  // CRAG (nós: grade_context, rewrite_query, self_check) — IA-01
  contextGrade: z.enum(['relevant', 'ambiguous', 'irrelevant']).optional(),
  contextConfidence: z.number().min(0).max(1).optional(),
  retrievalAttempts: z.number().default(0),
  rewrittenQuery: z.string().optional(),
  selfCheckPassed: z.boolean().optional(),
  selfCheckIssues: z.array(z.string()).optional(),
  regenerationAttempts: z.number().default(0),

  // Ferramentas executadas (Function Calling)
  toolsExecuted: z.array(z.object({
    name: z.string(),
    args: z.record(z.string(), z.unknown()),
    result: z.unknown(),
  })).optional(),

  // Geração (nó: generate)
  response: z.string().optional(),
  streamTokens: z.array(z.string()).optional(),

  // Validação final (nó: validate)
  validationPassed: z.boolean().optional(),
  validationIssue: z.string().optional(),

  // IA-21 — Veto do classificador de segurança (nó: safety_veto)
  safetyVetoed: z.boolean().optional(),
  safetyCategories: z.array(z.string()).optional(),

  // IA-14 — Idioma detectado (nó: classify)
  detectedLanguage: z.enum(['pt', 'en', 'es']).optional(),

  // Escalação (nó: escalate)
  requiresHuman: z.boolean().optional(),
  escalationReason: z.string().optional(),

  // Metadados de execução
  steps: z.array(z.string()).default([]),
  startedAt: z.string().default(() => new Date().toISOString()),
  tokensUsed: z.number().default(0),
  error: z.string().optional(),
});

export type AgentState = z.infer<typeof AgentStateSchema>;

export const initialState = (input: {
  tenantId: string;
  customerId: string;
  conversationId: string;
  userMessage: string;
}): AgentState => ({
  ...input,
  steps: [],
  startedAt: new Date().toISOString(),
  tokensUsed: 0,
  toolsExecuted: [],
  retrievalAttempts: 0,
  regenerationAttempts: 0,
});
