/**
 * Context Window Manager — gerencia o histórico de conversa.
 *
 * PROBLEMA: GPT-4o tem limite de ~128k tokens. Conversas longas podem:
 * 1. Exceder o limite → erro da API
 * 2. Custar muito (tokens caros)
 * 3. Diluir o contexto recente com mensagens antigas irrelevantes
 *
 * SOLUÇÃO: Sliding Window com compressão inteligente
 * - Manter as últimas N mensagens integralmente (contexto recente)
 * - Comprimir mensagens antigas em um resumo
 * - Sempre incluir a primeira mensagem do sistema (contexto do bot)
 */

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ContextWindowOptions {
  maxTokens?: number;         // limite de tokens do modelo (default: 8000 para segurança)
  maxMessages?: number;       // máximo de mensagens no histórico (default: 20)
  recentMessagesCount?: number; // mensagens recentes a preservar integralmente (default: 6)
}

/**
 * Estimativa de tokens (sem custo de API).
 * ~3.5 chars por token em português.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function estimateMessagesTokens(messages: ConversationMessage[]): number {
  return messages.reduce((total, msg) => total + estimateTokens(msg.content) + 4, 0);
}

/**
 * Comprime mensagens antigas em um resumo simples.
 * Em produção: pode chamar o LLM para fazer um resumo mais inteligente.
 */
function compressOldMessages(messages: ConversationMessage[]): ConversationMessage {
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
  const summary = `[Resumo do início da conversa: o cliente perguntou sobre: ${userMessages.slice(0, 3).join('; ')}]`;

  return {
    role: 'system',
    content: summary,
  };
}

/**
 * Aplica a janela de contexto no histórico da conversa.
 * Retorna as mensagens que devem ser enviadas ao LLM.
 */
export function applyContextWindow(
  messages: ConversationMessage[],
  options: ContextWindowOptions = {}
): ConversationMessage[] {
  const {
    maxTokens = 8000,
    maxMessages = 20,
    recentMessagesCount = 6,
  } = options;

  if (messages.length === 0) return [];

  // Separar mensagem de sistema (sempre preservar)
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');

  // Se dentro do limite, retornar tudo
  if (
    conversationMessages.length <= maxMessages &&
    estimateMessagesTokens(messages) <= maxTokens
  ) {
    return messages;
  }

  // Manter as mensagens mais recentes
  const recentMessages = conversationMessages.slice(-recentMessagesCount);

  // Comprimir as mensagens antigas
  const oldMessages = conversationMessages.slice(0, -recentMessagesCount);
  const compressionNeeded = oldMessages.length > 0;

  const result: ConversationMessage[] = [...systemMessages];

  if (compressionNeeded) {
    result.push(compressOldMessages(oldMessages));
  }

  result.push(...recentMessages);

  return result;
}

/**
 * Busca histórico da conversa no banco e aplica a janela de contexto.
 */
export async function getConversationContext(
  conversationId: string,
  tenantId: string,
  supabaseAdmin: any,
  options: ContextWindowOptions = {}
): Promise<ConversationMessage[]> {
  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
    .limit(50); // nunca buscar mais de 50 mensagens do banco

  if (!messages || messages.length === 0) return [];

  const conversationMessages: ConversationMessage[] = messages.map((m: any) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  return applyContextWindow(conversationMessages, options);
}
