import { supabaseAdmin } from '../database/supabase.client';

/**
 * System Prompt Builder — constrói prompts personalizados por tenant.
 *
 * Cada ISP tem sua configuração de IA:
 * - Nome do bot (ex: "Astro", "Max", "Sofia")
 * - Personalidade (formal, descontraído, técnico)
 * - Instruções customizadas (horário de atendimento, políticas específicas)
 * - Contexto do negócio (planos disponíveis, região de atuação)
 *
 * O prompt é construído dinamicamente na hora da request — sem cache
 * para garantir que mudanças na configuração tomam efeito imediatamente.
 */

export interface SystemPromptContext {
  tenantId: string;
  customerName?: string;
  customerPlan?: string;
  customerStatus?: 'active' | 'suspended' | 'cancelled';
  ragContext?: string;       // chunks do RAG (já formatados)
  currentDateTime?: string;
}

export interface BuiltSystemPrompt {
  prompt: string;
  botName: string;
  temperature: number;
  maxTokens: number;
}

const DEFAULT_CONFIG = {
  botName: 'Astro',
  personality: 'profissional, prestativo e objetivo',
  language: 'pt-BR',
  temperature: 0.7,
  maxTokensPerMessage: 1000,
  customInstructions: '',
};

export async function buildSystemPrompt(
  context: SystemPromptContext
): Promise<BuiltSystemPrompt> {
  // Buscar configuração do tenant
  const { data: config } = await supabaseAdmin
    .from('ai_configurations')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .single();

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('name')
    .eq('id', context.tenantId)
    .single();

  const cfg = config ?? DEFAULT_CONFIG;
  const tenantName = tenant?.name ?? 'nosso provedor';
  const now = context.currentDateTime ?? new Date().toLocaleString('pt-BR');

  // Construir seções do prompt
  const sections: string[] = [];

  // Identidade
  sections.push(
    `Você é ${cfg.bot_name ?? DEFAULT_CONFIG.botName}, assistente virtual do ${tenantName}.`
  );

  // Personalidade
  sections.push(
    `Seu estilo é: ${cfg.personality ?? DEFAULT_CONFIG.personality}.`
  );

  // Contexto do cliente (se disponível)
  if (context.customerName) {
    let clientContext = `Você está atendendo: ${context.customerName}.`;

    if (context.customerPlan) {
      clientContext += ` Plano atual: ${context.customerPlan}.`;
    }

    if (context.customerStatus === 'suspended') {
      clientContext += ` ⚠️ ATENÇÃO: Conexão do cliente está SUSPENSA.`;
    }

    sections.push(clientContext);
  }

  // Data/hora atual
  sections.push(`Data/hora atual: ${now}.`);

  // Contexto RAG (se fornecido)
  if (context.ragContext) {
    sections.push(`
=== BASE DE CONHECIMENTO DO ISP ===
${context.ragContext}
=== FIM DA BASE DE CONHECIMENTO ===

Use as informações acima para responder. Se a resposta não estiver na base, informe e sugira o suporte.`);
  }

  // Regras de comportamento
  sections.push(`
REGRAS:
- Responda SEMPRE em português do Brasil
- Nunca invente informações técnicas
- Para problemas técnicos graves, escale para um operador humano
- Nunca mencione que é uma IA se não perguntarem diretamente
- Seja conciso: máximo 3 parágrafos salvo necessidade técnica`);

  // Instruções customizadas do ISP
  if (cfg.custom_instructions) {
    sections.push(`\nINSTRUÇÕES ESPECÍFICAS DO ISP:\n${cfg.custom_instructions}`);
  }

  return {
    prompt: sections.join('\n\n'),
    botName: cfg.bot_name ?? DEFAULT_CONFIG.botName,
    temperature: cfg.temperature ?? DEFAULT_CONFIG.temperature,
    maxTokens: cfg.max_tokens_per_message ?? DEFAULT_CONFIG.maxTokensPerMessage,
  };
}
