import { describe, it, expect } from 'vitest';
import { isDmParticipant, isGroupMember, canAccess, getUnreadCount, InternalChannel, InternalMessage } from './internal-chat.service';

const DM: InternalChannel = { id: 'ch1', tenantId: 't1', type: 'dm', memberIds: ['op1', 'op2'], createdAt: '2026-07-22' };
const GROUP: InternalChannel = { id: 'ch2', tenantId: 't1', type: 'group', name: 'Suporte Nível 2', memberIds: ['op1', 'op2', 'op3'], createdAt: '2026-07-22' };

const MESSAGES: InternalMessage[] = [
  { id: 'm1', channelId: 'ch1', senderId: 'op1', content: 'Olá', createdAt: '2026-07-22T10:00:00Z', readBy: ['op1'] },
  { id: 'm2', channelId: 'ch1', senderId: 'op2', content: 'Oi', createdAt: '2026-07-22T10:01:00Z', readBy: ['op2'] },
  { id: 'm3', channelId: 'ch1', senderId: 'op2', content: 'Ajuda aqui', createdAt: '2026-07-22T10:02:00Z', readBy: ['op2'] },
];

describe('internal-chat.service', () => {
  it('isDmParticipant verifica participação em DM', () => {
    expect(isDmParticipant(DM, 'op1')).toBe(true);
    expect(isDmParticipant(DM, 'op3')).toBe(false);
    expect(isDmParticipant(GROUP, 'op1')).toBe(false);
  });

  it('isGroupMember verifica participação em grupo', () => {
    expect(isGroupMember(GROUP, 'op1')).toBe(true);
    expect(isGroupMember(GROUP, 'op4')).toBe(false);
    expect(isGroupMember(DM, 'op1')).toBe(false);
  });

  it('canAccess funciona para DM e grupo', () => {
    expect(canAccess(DM, 'op1')).toBe(true);
    expect(canAccess(GROUP, 'op3')).toBe(true);
    expect(canAccess(DM, 'op5')).toBe(false);
  });

  it('getUnreadCount conta mensagens não lidas pelo usuário', () => {
    expect(getUnreadCount(MESSAGES, 'op1')).toBe(2);
    expect(getUnreadCount(MESSAGES, 'op2')).toBe(1);
  });

  it('getUnreadCount retorna 0 para lista vazia', () => {
    expect(getUnreadCount([], 'op1')).toBe(0);
  });
});
