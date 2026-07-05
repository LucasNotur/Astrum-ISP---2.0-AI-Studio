import { describe, it, expect } from 'vitest';
import { splitTicket } from './ticket-splitter';

const ticket = {
  id: 't_legacy_1',
  customerId: 'c1',
  subject: 'Internet lenta',
  createdAt: '2024-01-01T10:00:00Z',
  messages: [
    { id: 'm2', senderType: 'ai', text: 'Vou verificar', createdAt: '2024-01-01T10:01:00Z' },
    { id: 'm1', senderType: 'customer', text: 'Minha internet está lenta', createdAt: '2024-01-01T10:00:30Z' },
    { id: 'm3', senderType: 'human', text: 'Resolvido', createdAt: '2024-01-01T10:05:00Z' },
  ],
};

describe('ticket-splitter', () => {
  it('cria 1 conversation com vínculo ao ticket legado', () => {
    const r = splitTicket('t1', ticket, 'cust-uuid');
    expect(r.conversation.legacy_ticket_id).toBe('t_legacy_1');
    expect(r.conversation.customer_id).toBe('cust-uuid');
    expect(r.conversation.tenant_id).toBe('t1');
  });

  it('ordena mensagens cronologicamente (independente da ordem de origem)', () => {
    const r = splitTicket('t1', ticket, 'cust-uuid');
    expect(r.messages.map((m) => m.legacy_id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('mapeia senderType → role/from_ai corretamente', () => {
    const r = splitTicket('t1', ticket, 'cust-uuid');
    expect(r.messages[0]).toMatchObject({ role: 'user', from_ai: false });      // customer
    expect(r.messages[1]).toMatchObject({ role: 'assistant', from_ai: true });  // ai
    expect(r.messages[2]).toMatchObject({ role: 'assistant', from_ai: false }); // human
  });

  it('watermark = createdAt da última mensagem', () => {
    const r = splitTicket('t1', ticket, 'cust-uuid');
    expect(r.lastMessageAt).toBe('2024-01-01T10:05:00Z');
  });

  it('delta: com `since`, só inclui mensagens novas (não reprocessa antigas)', () => {
    const r = splitTicket('t1', ticket, 'cust-uuid', '2024-01-01T10:01:00Z');
    expect(r.messages.map((m) => m.legacy_id)).toEqual(['m3']);
    // watermark continua sendo o global, não o filtrado
    expect(r.lastMessageAt).toBe('2024-01-01T10:05:00Z');
  });

  it('ticket sem mensagens: conversation criada, zero mensagens, watermark null', () => {
    const r = splitTicket('t1', { id: 't_empty' }, null);
    expect(r.messages).toHaveLength(0);
    expect(r.lastMessageAt).toBeNull();
    expect(r.conversation.customer_id).toBeNull();
  });
});
