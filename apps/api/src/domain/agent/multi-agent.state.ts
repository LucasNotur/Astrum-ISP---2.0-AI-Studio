import { z } from 'zod';

/**
 * IA-10 — Multi-agente por domínio: estado compartilhado mínimo.
 *
 * O supervisor roteia a conversa para subgrafos especializados. Cada subgrafo
 * lê/escreve apenas os campos necessários, mantendo o estado enxuto e
 * serializável (evita acoplamento com objetos de serviço).
 */

export const AgentDomainSchema = z.enum([
  'atendimento',
  'cobranca',
  'retencao',
  'escalation',
]);

export type AgentDomain = z.infer<typeof AgentDomainSchema>;

export const MultiAgentStateSchema = z.object({
  // Input original
  tenantId: z.string(),
  customerId: z.string(),
  conversationId: z.string(),
  userMessage: z.string(),

  // Decisão do supervisor
  domain: AgentDomainSchema.optional(),
  domainReason: z.string().optional(),

  // Contexto acumulado entre subgrafos
  summary: z.string().optional(),

  // Resultado do subgrafo ativo
  subGraphResult: z.string().optional(),

  // Saída final
  response: z.string().optional(),
  requiresHuman: z.boolean().optional(),

  // Metadados
  steps: z.array(z.string()).default(() => []),
  startedAt: z.string().default(() => new Date().toISOString()),
  tokensUsed: z.number().default(0),
  error: z.string().optional(),
});

export type MultiAgentState = z.infer<typeof MultiAgentStateSchema>;

export const initialMultiAgentState = (input: {
  tenantId: string;
  customerId: string;
  conversationId: string;
  userMessage: string;
}): MultiAgentState => ({
  ...input,
  steps: [],
  startedAt: new Date().toISOString(),
  tokensUsed: 0,
});
