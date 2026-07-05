import { supabaseAdmin } from '../database/supabase.client';
import { atendimentoLogger } from '../logging/logger';
import type { IConversationDbPort, ICreateConversationInput, ISaveMessageInput } from '../../domain/ports/conversation.port';
import { makeConversationService } from '../../domain/atendimento/conversation.service';

export const conversationDbAdapter: IConversationDbPort = {
  async findOpenConversation(opts: ICreateConversationInput): Promise<string | null> {
    let query = supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('tenant_id', opts.tenantId)
      .eq('channel', opts.channel)
      .eq('status', 'open');

    // PostgREST: .eq('customer_id', null) não casa linhas NULL — usar .is()
    query = opts.customerId
      ? query.eq('customer_id', opts.customerId)
      : query.is('customer_id', null);

    const { data } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.id ?? null;
  },

  async createConversation(opts: ICreateConversationInput): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert({
        tenant_id: opts.tenantId,
        customer_id: opts.customerId,
        channel: opts.channel,
        status: 'open',
      })
      .select('id')
      .single();

    if (error || !data) throw new Error(`Erro ao criar conversa: ${error?.message}`);
    return data.id;
  },

  async saveMessage(opts: ISaveMessageInput): Promise<string> {
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

    if (error || !data) throw new Error(`Erro ao salvar mensagem: ${error?.message}`);
    return data.id;
  },

  async countMessages(conversationId: string, tenantId: string): Promise<number> {
    const { count } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('tenant_id', tenantId);

    return count ?? 0;
  },

  async escalate(conversationId: string, tenantId: string): Promise<void> {
    await supabaseAdmin
      .from('conversations')
      .update({ status: 'escalated', updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);
  },
};

// Pré-wired singleton — importar daqui para obter as funções com DB real
export const conversationService = makeConversationService({
  db: conversationDbAdapter,
  logger: atendimentoLogger,
});

export const {
  getOrCreateConversation,
  saveMessage,
  shouldEscalate,
  escalateConversation,
} = conversationService;
