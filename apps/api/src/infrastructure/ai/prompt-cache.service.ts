import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { getRedisClient } from '../cache/redis.client';
import { infraLogger } from '../logging/logger';

/**
 * Prompt Caching / Context Caching
 *
 * ESTRATÉGIA (Bloco 1 — FinOps de IA):
 * - O prompt de sistema (system prompt) é idêntico em 99% das chamadas de um mesmo tenant.
 * - A OpenAI cobra desconto de até 90% em tokens já processados anteriormente.
 * - Para isso, o system prompt precisa ser SEMPRE idêntico e estar no início do contexto.
 *
 * COMO FUNCIONA:
 * - Cada tenant tem um system prompt com: regras do negócio + manual técnico comprimido
 * - Esse prompt é "frozen" (nunca muda a menos que o tenant atualize os documentos)
 * - Helicone registra automaticamente os tokens cacheados vs. novos
 *
 * REFERÊNCIA: https://platform.openai.com/docs/guides/prompt-caching
 * Cache automático para prompts > 1024 tokens, em incrementos de 128 tokens.
 */

interface TenantSystemPrompt {
  tenantId: string;
  systemPrompt: string;
  tokenCount: number;
  cachedSince: string;
  documentVersion: string; // hash dos documentos para invalidação
}

const CACHE_TTL = 60 * 60 * 24; // 24 horas no Redis (alinhado com expiração do OpenAI)

export class PromptCacheService {
  private redis = getRedisClient();

  /**
   * Retorna o system prompt do tenant, priorizando cache Redis.
   * O prompt é construído uma única vez e reutilizado → garante cache na OpenAI.
   */
  async getSystemPrompt(tenantId: string): Promise<string> {
    const cacheKey = `prompt_cache:${tenantId}`;

    // Tentar Redis primeiro
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as TenantSystemPrompt;
      infraLogger.debug({ tenantId, tokenCount: parsed.tokenCount }, 'System prompt from Redis cache');
      return parsed.systemPrompt;
    }

    // Construir prompt fresco
    const prompt = await this._buildTenantSystemPrompt(tenantId);
    await this.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(prompt));

    infraLogger.info({ tenantId, tokenCount: prompt.tokenCount }, 'System prompt built and cached');
    return prompt.systemPrompt;
  }

  /**
   * Invalida o cache quando o tenant atualiza seus documentos.
   * Chamado após indexação de novo documento no RAG.
   */
  async invalidate(tenantId: string): Promise<void> {
    await this.redis.del(`prompt_cache:${tenantId}`);
    infraLogger.info({ tenantId }, 'System prompt cache invalidated');
  }

  /**
   * Constrói o system prompt do tenant com:
   * 1. Persona e regras do negócio
   * 2. Resumo comprimido dos documentos principais
   * 3. Exemplos Few-Shot estáticos (sempre no mesmo lugar → cache eficiente)
   */
  private async _buildTenantSystemPrompt(tenantId: string): Promise<TenantSystemPrompt> {
    const { supabase } = await import('../database/supabase.client');

    // Buscar config do tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, ai_persona, business_rules, plan')
      .eq('id', tenantId)
      .single();

    // Buscar sumário dos documentos principais (top 3 mais usados)
    const { data: docs } = await supabase
      .from('knowledge_documents')
      .select('filename, summary')
      .eq('tenant_id', tenantId)
      .eq('status', 'indexed')
      .order('usage_count', { ascending: false })
      .limit(3);

    const docSummary = docs?.map(d =>
      `[${d.filename}]: ${d.summary ?? 'Sem resumo disponível'}`
    ).join('\n') ?? '';

    const systemPrompt = `
Você é ${tenant?.ai_persona ?? 'o assistente de suporte da operadora'}, da empresa ${tenant?.name ?? 'ISP'}.

## REGRAS DO NEGÓCIO
${tenant?.business_rules ?? 'Sempre seja cordial e resolva o problema do cliente.'}

## DOCUMENTOS DE REFERÊNCIA (resumos)
${docSummary}

## COMPORTAMENTO
- Pense passo a passo antes de cada resposta
- Nunca invente informações técnicas
- Se não souber, crie um ticket para escalação
- Responda sempre em português do Brasil
- Para diagnósticos técnicos, solicite modelo do equipamento e CEP

## PLANO ATIVO
Plano ${tenant?.plan ?? 'starter'} — Recursos disponíveis conforme contrato.
`.trim();

    return {
      tenantId,
      systemPrompt,
      tokenCount: Math.ceil(systemPrompt.length / 4), // estimativa ~4 chars/token
      cachedSince: new Date().toISOString(),
      documentVersion: 'v1',
    };
  }
}

export const promptCacheService = new PromptCacheService();
