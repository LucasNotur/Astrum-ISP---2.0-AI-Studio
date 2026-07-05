import { describe, it, expect, vi } from 'vitest';
import { makeConversationService } from './conversation.service';
import type { IConversationDbPort } from '../ports/conversation.port';
import type { ILoggerPort } from '../ports/logger.port';

const logger: ILoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function makeDb(overrides: Partial<IConversationDbPort> = {}): IConversationDbPort {
  return {
    findOpenConversation: vi.fn().mockResolvedValue(null),
    createConversation: vi.fn().mockResolvedValue('conv-new'),
    saveMessage: vi.fn().mockResolvedValue('msg-1'),
    countMessages: vi.fn().mockResolvedValue(2),
    escalate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('Conversation Service', () => {
  it('getOrCreateConversation retorna ID existente sem criar', async () => {
    const db = makeDb({ findOpenConversation: vi.fn().mockResolvedValue('conv-123') });
    const svc = makeConversationService({ db, logger });

    const id = await svc.getOrCreateConversation({ tenantId: 't1', channel: 'whatsapp', customerId: 'cust-1' });

    expect(id).toBe('conv-123');
    expect(db.createConversation).not.toHaveBeenCalled();
  });

  it('getOrCreateConversation cria nova quando não existe', async () => {
    const db = makeDb();
    const svc = makeConversationService({ db, logger });

    const id = await svc.getOrCreateConversation({ tenantId: 't1', channel: 'whatsapp', customerId: 'cust-1' });

    expect(id).toBe('conv-new');
    expect(db.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', channel: 'whatsapp', customerId: 'cust-1' }),
    );
  });

  it('BUG S68: findOpenConversation recebe opts sem customerId (sem .eq(null))', async () => {
    const db = makeDb();
    const svc = makeConversationService({ db, logger });

    await svc.getOrCreateConversation({ tenantId: 't1', channel: 'webchat' });

    // adapter é quem chama .is('customer_id', null) — service só delega opts sem customerId
    expect(db.findOpenConversation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', channel: 'webchat' }),
    );
    const callArg = (db.findOpenConversation as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(callArg?.customerId).toBeUndefined();
  });

  it('shouldEscalate detecta palavra-chave de cancelamento', async () => {
    const svc = makeConversationService({ db: makeDb(), logger });
    const result = await svc.shouldEscalate('conv-1', 'tenant-1', 'Quero cancelar meu plano');
    expect(result).toBe(true);
  });

  it('shouldEscalate detecta pedido de atendente', async () => {
    const svc = makeConversationService({ db: makeDb(), logger });
    const result = await svc.shouldEscalate('conv-1', 'tenant-1', 'quero falar com um atendente');
    expect(result).toBe(true);
  });

  it('shouldEscalate não escalona mensagem normal com poucas mensagens', async () => {
    const svc = makeConversationService({ db: makeDb({ countMessages: vi.fn().mockResolvedValue(2) }), logger });
    const result = await svc.shouldEscalate('conv-1', 'tenant-1', 'minha internet está lenta');
    expect(result).toBe(false);
  });

  it('shouldEscalate escalona quando count >= 10', async () => {
    const svc = makeConversationService({ db: makeDb({ countMessages: vi.fn().mockResolvedValue(10) }), logger });
    const result = await svc.shouldEscalate('conv-1', 'tenant-1', 'mensagem normal');
    expect(result).toBe(true);
  });
});
