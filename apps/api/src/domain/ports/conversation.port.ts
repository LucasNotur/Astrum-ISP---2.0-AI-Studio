export type ConversationChannel =
  | 'whatsapp'
  | 'webchat'
  | 'facebook'
  | 'instagram'
  | 'messenger'
  | 'email'
  | 'telephony';

export interface ICreateConversationInput {
  tenantId: string;
  customerId?: string;
  channel: ConversationChannel;
  externalId?: string;
}

export interface ISaveMessageInput {
  tenantId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  fromAI?: boolean;
  tokensUsed?: number;
}

export interface IConversationDbPort {
  findOpenConversation(opts: ICreateConversationInput): Promise<string | null>;
  createConversation(opts: ICreateConversationInput): Promise<string>;
  saveMessage(opts: ISaveMessageInput): Promise<string>;
  countMessages(conversationId: string, tenantId: string): Promise<number>;
  escalate(conversationId: string, tenantId: string): Promise<void>;
}
