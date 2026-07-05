import { generateObject, generateText, streamText, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { infraLogger } from '../logging/logger';
import { resolvePrompt, type PromptVersion } from './prompt-registry';
import { isModelCascadeEnabled } from '../cache/semantic-cache.service';

/**
 * Vercel AI SDK Service
 *
 * ESTRATÉGIA:
 * - generateObject(): respostas estruturadas com schema Zod (zero alucinação de formato)
 * - streamText(): streaming SSE no chat (substitui chamada raw ao OpenAI)
 * - generateText(): respostas simples não-estruturadas
 *
 * BLOCO 2: Structured Outputs — OpenAI nunca retorna JSON mal-formado.
 * Se a resposta não bater com o schema Zod, lança ZodError antes de chegar ao banco.
 */

// ─── Schemas Zod ────────────────────────────────────────────────────────────

/** Diagnóstico técnico de rede gerado pela IA */
export const NetworkDiagnosticSchema = z.object({
  problem_category: z.enum([
    'signal_loss', 'slow_speed', 'intermittent', 'equipment_failure',
    'billing', 'configuration', 'other'
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  recommended_action: z.enum([
    'reboot_equipment', 'check_cables', 'schedule_technician',
    'check_invoice', 'escalate_human', 'send_instructions'
  ]),
  estimated_resolution_hours: z.number().min(0).max(72),
  technical_notes: z.string().max(500),
  requires_human: z.boolean(),
});

export type NetworkDiagnostic = z.infer<typeof NetworkDiagnosticSchema>;

/** Dados estruturados do cliente extraídos da conversa */
export const CustomerIntentSchema = z.object({
  intent: z.enum([
    'support_technical', 'support_billing', 'upgrade_plan',
    'cancel_service', 'check_status', 'complaint', 'other'
  ]),
  urgency: z.enum(['low', 'normal', 'high']),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'frustrated']),
  extracted_data: z.object({
    cpf: z.string().optional(),
    contract_id: z.string().optional(),
    address: z.string().optional(),
    equipment_model: z.string().optional(),
  }),
  suggested_tools: z.array(z.enum([
    'suspend_signal', 'check_invoice', 'create_ticket',
    'query_rag', 'query_supabase', 'escalate_human'
  ])),
});

export type CustomerIntent = z.infer<typeof CustomerIntentSchema>;

/** Relatório de ticket estruturado */
export const TicketReportSchema = z.object({
  title: z.string().max(100),
  description: z.string().max(1000),
  category: z.enum(['technical', 'billing', 'commercial', 'complaint']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  tags: z.array(z.string()).max(5),
  auto_resolved: z.boolean(),
  resolution_summary: z.string().max(500).optional(),
});

export type TicketReport = z.infer<typeof TicketReportSchema>;

// ─── Tools (Function Calling) ────────────────────────────────────────────────

/**
 * Ferramentas disponíveis para o agente IA.
 * O modelo decide autonomamente quando e como usá-las.
 */
export const agentTools = {
  suspend_signal: {
    description: 'Suspende o sinal de internet de um cliente inadimplente. Use apenas quando a política de cobrança autorizar.',
    parameters: z.object({
      customer_id: z.string().describe('ID único do cliente no Supabase'),
      reason: z.string().describe('Motivo da suspensão para log de auditoria'),
      scheduled_for: z.string().datetime().optional().describe('Agendar para data futura (ISO 8601). Null = imediato.'),
    }),
  },
  check_invoice: {
    description: 'Consulta o status de faturas de um cliente. Use para responder perguntas sobre pagamentos.',
    parameters: z.object({
      customer_id: z.string(),
      include_overdue_only: z.boolean().default(false),
    }),
  },
  create_ticket: {
    description: 'Cria um ticket de suporte no sistema quando não conseguir resolver automaticamente.',
    parameters: z.object({
      customer_id: z.string(),
      title: z.string().max(100),
      description: z.string().max(500),
      priority: z.enum(['low', 'medium', 'high', 'urgent']),
      category: z.enum(['technical', 'billing', 'commercial', 'complaint']),
    }),
  },
  query_knowledge_base: {
    description: 'Busca informações nos manuais técnicos e documentos do ISP. Use para perguntas técnicas sobre equipamentos, configurações e procedimentos.',
    parameters: z.object({
      query: z.string().describe('Pergunta técnica para buscar na base de conhecimento'),
      max_results: z.number().min(1).max(5).default(3),
    }),
  },
};

// ─── Service ─────────────────────────────────────────────────────────────────

export class VercelAIService {
  private readonly model = openai('gpt-4o-mini');
  private readonly heavyModel = openai('gpt-4o');

  /**
   * Classifica a intenção do cliente com saída estruturada (Zod).
   * BLOCO 2: generateObject → zero risco de JSON mal-formado.
   */
  async classifyIntent(
    message: string,
    conversationHistory: string,
    tenantId: string,
  ): Promise<CustomerIntent> {
    const prompt = resolvePrompt('classification');
    const { object } = await generateObject({
      model: this.model as any,
      schema: CustomerIntentSchema,
      system: prompt.text,
      messages: [
        {
          role: 'user',
          content: `Histórico:\n${conversationHistory}\n\nMensagem atual: "${message}"`,
        },
      ],
      headers: {
        'Helicone-Property-TenantId': tenantId,
        'Helicone-Property-UseCase': 'classify-intent',
        'Helicone-Property-PromptVersion': prompt.version,
      },
    });

    infraLogger.info({ intent: object.intent, urgency: object.urgency }, 'Intent classified');
    return object;
  }

  /**
   * Gera diagnóstico técnico estruturado.
   * CoT ativado: "Pense passo a passo" no system prompt.
   */
  async generateNetworkDiagnostic(
    customerMessage: string,
    ragContext: string,
    tenantId: string,
  ): Promise<NetworkDiagnostic> {
    const prompt = resolvePrompt('technical_diagnostic');
    const { object } = await generateObject({
      model: this.heavyModel as any, // GPT-4o para diagnósticos técnicos
      schema: NetworkDiagnosticSchema,
      system: prompt.text,
      messages: [
        {
          role: 'user',
          content: `Contexto técnico dos manuais:\n${ragContext}\n\nQueixa do cliente: "${customerMessage}"`,
        },
      ],
      headers: {
        'Helicone-Property-TenantId': tenantId,
        'Helicone-Property-UseCase': 'network-diagnostic',
        'Helicone-Property-PromptVersion': prompt.version,
      },
    });

    return object;
  }

  /**
   * Gera relatório de ticket estruturado ao encerrar atendimento.
   */
  async generateTicketReport(
    conversationSummary: string,
    resolution: string,
    tenantId: string,
  ): Promise<TicketReport> {
    const prompt = resolvePrompt('ticket_report');
    const { object } = await generateObject({
      model: this.model as any,
      schema: TicketReportSchema,
      system: prompt.text,
      messages: [
        {
          role: 'user',
          content: `Resumo da conversa:\n${conversationSummary}\n\nResolução:\n${resolution}`,
        },
      ],
      headers: {
        'Helicone-Property-TenantId': tenantId,
        'Helicone-Property-UseCase': 'ticket-report',
        'Helicone-Property-PromptVersion': prompt.version,
      },
    });

    return object;
  }

  /**
   * Streaming SSE com Function Calling.
   * O agente decide quando usar as ferramentas.
   */
  private _resolvePrompt(useCase: string): PromptVersion {
    return resolvePrompt(useCase);
  }

  async streamWithTools(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemContext: string,
    tenantId: string,
    onToolCall?: (toolName: string, args: unknown) => Promise<unknown>,
    opts?: { tier?: 'mini' | 'full' },
  ) {
    const prompt = this._resolvePrompt('chat');
    const useMini = isModelCascadeEnabled() && opts?.tier === 'mini';
    const selectedModel = useMini ? this.model : this.heavyModel;

    const result = streamText({
      model: selectedModel as any,
      system: `${prompt.text}\n\n${systemContext}`,
      messages,
      tools: agentTools as any,
      stopWhen: stepCountIs(5), // máximo de tool calls em sequência (ai-sdk v6)
      onStepFinish: async (step) => {
        if (step.toolCalls && onToolCall) {
          for (const toolCall of step.toolCalls) {
            infraLogger.info({
              tool: toolCall.toolName,
              args: toolCall.input,
              tenantId,
            }, 'Tool called by agent');

            await onToolCall(toolCall.toolName, toolCall.input);
          }
        }
      },
      headers: {
        'Helicone-Property-TenantId': tenantId,
        'Helicone-Property-UseCase': 'chat-stream',
        'Helicone-Property-PromptVersion': prompt.version,
      },
    });

    return result;
  }

  // ─── System Prompts com CoT (delegam ao prompt-registry — IA-03) ────────────

  private _buildSystemPrompt(useCase: string): string {
    return this._resolvePrompt(useCase).text;
  }
}

export const vercelAIService = new VercelAIService();
