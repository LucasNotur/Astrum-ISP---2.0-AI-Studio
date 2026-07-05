import type { IConversationDbPort, ICreateConversationInput, ISaveMessageInput } from '../ports/conversation.port';
import type { ILoggerPort } from '../ports/logger.port';

export type { ICreateConversationInput as CreateConversationOptions, ISaveMessageInput as SaveMessageOptions };

const ESCALATION_KEYWORDS = [
  'falar com humano', 'atendente', 'gerente', 'reclamação',
  'cancelar', 'processo', 'procon', 'advogado',
];

export function makeConversationService(deps: { db: IConversationDbPort; logger: ILoggerPort }) {
  const { db, logger } = deps;

  async function getOrCreateConversation(opts: ICreateConversationInput): Promise<string> {
    const existing = await db.findOpenConversation(opts);
    if (existing) return existing;

    const id = await db.createConversation(opts);
    logger.info(
      { tenantId: opts.tenantId, conversationId: id, channel: opts.channel },
      'Nova conversa criada',
    );
    return id;
  }

  async function saveMessage(opts: ISaveMessageInput): Promise<string> {
    try {
      return await db.saveMessage(opts);
    } catch (err) {
      logger.error({ err }, 'Erro ao salvar mensagem');
      throw err;
    }
  }

  async function shouldEscalate(
    conversationId: string,
    tenantId: string,
    lastMessage: string,
  ): Promise<boolean> {
    const hasKeyword = ESCALATION_KEYWORDS.some(kw =>
      lastMessage.toLowerCase().includes(kw),
    );
    if (hasKeyword) return true;
    const count = await db.countMessages(conversationId, tenantId);
    return count >= 10;
  }

  async function escalateConversation(
    conversationId: string,
    tenantId: string,
    reason: string,
  ): Promise<void> {
    await db.escalate(conversationId, tenantId);
    logger.info(
      { conversationId, tenantId, reason },
      '⚠️ Conversa escalada para operador humano',
    );
  }

  return { getOrCreateConversation, saveMessage, shouldEscalate, escalateConversation };
}
