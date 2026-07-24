/**
 * Dossiê #61 — Chat Interno NATIVO P2P.
 * Permite operadores trocarem mensagens internas dentro da plataforma
 * sem usar canais externos. Suporta DM e grupos.
 */

export interface InternalMessage {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  createdAt: string;
  readBy: string[];
}

export interface InternalChannel {
  id: string;
  tenantId: string;
  type: 'dm' | 'group';
  name?: string;
  memberIds: string[];
  createdAt: string;
}

export interface InternalChatPorts {
  getOrCreateDm: (tenantId: string, userA: string, userB: string) => Promise<InternalChannel>;
  createGroup: (tenantId: string, name: string, memberIds: string[]) => Promise<InternalChannel>;
  sendMessage: (channelId: string, senderId: string, content: string) => Promise<InternalMessage>;
  getMessages: (channelId: string, limit: number, before?: string) => Promise<InternalMessage[]>;
  markRead: (channelId: string, userId: string) => Promise<void>;
  getChannels: (tenantId: string, userId: string) => Promise<InternalChannel[]>;
}

export function isDmParticipant(channel: InternalChannel, userId: string): boolean {
  return channel.type === 'dm' && channel.memberIds.includes(userId);
}

export function isGroupMember(channel: InternalChannel, userId: string): boolean {
  return channel.type === 'group' && channel.memberIds.includes(userId);
}

export function canAccess(channel: InternalChannel, userId: string): boolean {
  return channel.memberIds.includes(userId);
}

export function getUnreadCount(messages: InternalMessage[], userId: string): number {
  return messages.filter((m) => m.senderId !== userId && !m.readBy.includes(userId)).length;
}
