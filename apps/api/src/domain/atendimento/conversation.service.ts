import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { atendimentoLogger } from '../../infrastructure/logging/logger';

/**
 * Serviço de conversas — gerencia o ciclo de vida das conversas e mensagens.
 */

export interface CreateConversationOptions {
  tenantId: string;
  customerId?: string;
  channel: 'whatsapp' | 'webchat' | 'facebook';
  externalId?: string; // ID da conversa no WhatsApp/Evolution
}

export interface SaveMessageOptions {
  tenantId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  fromAI?: boolean;
  tokensUsed?: number;
}

/**
 * Busca ou cria conversa baseada no customerId + channel.
 * Evita criar conversas duplicadas para o mesmo canal.
 */
export async function getOrCreateConversation(
  opts: CreateConversationOptions
): Promise<string> {
  // Buscar conversa aberta existente
  const { data: existing } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('tenant_id', opts.tenantId)
    .eq('channel', opts.channel)
    .eq('status', 'open')
    .eq('customer_id', opts.customerId ?? null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Criar nova conversa
  const { data: newConv, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      tenant_id: opts.tenantId,
      customer_id: opts.customerId,
      channel: opts.channel,
      status: 'open',
    })
    .select('id')
    .single();

  if (error || !newConv) {
    throw new Error(`Erro ao criar conversa: ${error?.message}`);
  }

  atendimentoLogger.info(
    { tenantId: opts.tenantId, conversationId: newConv.id, channel: opts.channel },
    'Nova conversa criada'
  );

  return newConv.id;
}

/**
 * Salva uma mensagem no histórico da conversa.
 */
export async function saveMessage(opts: SaveMessageOptions): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      tenant_id: opts.tenantId,
      conversation_id: opts.conversationId,
      role: opts.role,
      content: opts.content,
      from_ai: opts.fromAI ?? false,
      tokens_used: opts.tokensUsed ?? 0,
    })
    .select('id')
    .single();

  if (error || !data) {
    atendimentoLogger.error({ err: error }, 'Erro ao salvar mensagem');
    throw new Error(`Erro ao salvar mensagem: ${error?.message}`);
  }

  return data.id;
}

/**
 * Verifica se a conversa deve ser escalada para humano.
 * Critérios: 3+ mensagens sem resolução, palavra-chave de urgência, etc.
 */
export async function shouldEscalate(
  conversationId: string,
  tenantId: string,
  lastMessage: string
): Promise<boolean> {
  const ESCALATION_KEYWORDS = [
    'falar com humano', 'atendente', 'gerente', 'reclamação',
    'cancelar', 'processo', 'procon', 'advogado',
  ];

  const hasKeyword = ESCALATION_KEYWORDS.some(kw =>
    lastMessage.toLowerCase().includes(kw)
  );

  if (hasKeyword) return true;

  // Verificar quantidade de mensagens sem resolução
  const { count } = await supabaseAdmin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('tenant_id', tenantId);

  return (count ?? 0) >= 10; // 10+ mensagens → escalar
}

/**
 * Escalona conversa para operador humano.
 */
export async function escalateConversation(
  conversationId: string,
  tenantId: string,
  reason: string
): Promise<void> {
  await supabaseAdmin
    .from('conversations')
    .update({ status: 'escalated', updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId);

  atendimentoLogger.info(
    { conversationId, tenantId, reason },
    '⚠️ Conversa escalada para operador humano'
  );
}
