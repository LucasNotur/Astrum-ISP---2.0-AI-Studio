import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  importWhatsAppHistory,
  type EvolutionChat,
  type EvolutionMessage,
  type HistoryImportPorts,
} from './history-import.service';

function chat(id: string, jid: string, name?: string): EvolutionChat {
  return { id, remoteJid: jid, name };
}

function msg(id: string, jid: string, fromMe: boolean, text: string, ts = 1700000000): EvolutionMessage {
  return {
    key: { id, remoteJid: jid, fromMe },
    message: { conversation: text },
    messageTimestamp: ts,
  };
}

function makePorts(opts: {
  chats?: EvolutionChat[];
  messages?: EvolutionMessage[];
  existingConvIds?: string[];
  existingMsgIds?: string[];
} = {}): HistoryImportPorts {
  const existingConvs = new Set(opts.existingConvIds ?? []);
  const existingMsgs = new Set(opts.existingMsgIds ?? []);
  let convCounter = 0;

  const db: any = {
    from: (table: string) => {
      if (table === 'conversations') {
        return {
          select: () => ({
            eq: (_: string, __: string) => ({
              eq: (_: string, legacyId: string) => ({
                maybeSingle: () => Promise.resolve({
                  data: existingConvs.has(legacyId) ? { id: `existing-${legacyId}` } : null,
                }),
              }),
            }),
          }),
          insert: (row: any) => ({
            select: () => ({
              single: () => {
                convCounter++;
                return Promise.resolve({ data: { id: `new-conv-${convCounter}` }, error: null });
              },
            }),
          }),
        };
      }
      if (table === 'messages') {
        return {
          select: () => ({
            eq: (_: string, __: string) => ({
              eq: (_: string, legacyId: string) => ({
                maybeSingle: () => Promise.resolve({
                  data: existingMsgs.has(legacyId) ? { id: `existing-msg-${legacyId}` } : null,
                }),
              }),
            }),
          }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
      return {};
    },
  };

  return {
    db,
    fetchChats: vi.fn().mockResolvedValue(opts.chats ?? []),
    fetchMessages: vi.fn().mockResolvedValue(opts.messages ?? []),
  };
}

describe('F6-01 — importWhatsAppHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('importa chats e mensagens sem duplicar', async () => {
    const ports = makePorts({
      chats: [chat('c1', '5511999999999@s.whatsapp.net', 'João')],
      messages: [
        msg('m1', '5511999999999@s.whatsapp.net', false, 'Oi, preciso de ajuda'),
        msg('m2', '5511999999999@s.whatsapp.net', true, 'Olá! Como posso ajudar?'),
      ],
    });

    const result = await importWhatsAppHistory('t1', 'instance1', ports);

    expect(result.chatsFound).toBe(1);
    expect(result.conversationsCreated).toBe(1);
    expect(result.messagesImported).toBe(2);
    expect(result.duplicatesSkipped).toBe(0);
    expect(ports.fetchChats).toHaveBeenCalledWith('instance1', expect.any(String), expect.any(String));
  });

  it('pula mensagens já importadas (dedupe por legacy_id)', async () => {
    const ports = makePorts({
      chats: [chat('c1', '5511999999999@s.whatsapp.net')],
      messages: [
        msg('m1', '5511999999999@s.whatsapp.net', false, 'Já importada'),
        msg('m2', '5511999999999@s.whatsapp.net', false, 'Nova'),
      ],
      existingMsgIds: ['m1'],
    });

    const result = await importWhatsAppHistory('t1', 'instance1', ports);

    expect(result.messagesImported).toBe(1);
    expect(result.duplicatesSkipped).toBe(1);
  });

  it('pula chats de grupo (@g.us)', async () => {
    const ports = makePorts({
      chats: [
        chat('c1', '5511999999999@s.whatsapp.net'),
        chat('c2', '120363xxx@g.us'),
      ],
      messages: [msg('m1', '5511999999999@s.whatsapp.net', false, 'ok')],
    });

    const result = await importWhatsAppHistory('t1', 'instance1', ports);

    expect(result.conversationsCreated).toBe(1);
  });

  it('reusa conversa existente sem criar duplicata', async () => {
    const ports = makePorts({
      chats: [chat('c1', '5511999999999@s.whatsapp.net')],
      messages: [msg('m1', '5511999999999@s.whatsapp.net', false, 'msg')],
      existingConvIds: ['c1'],
    });

    const result = await importWhatsAppHistory('t1', 'instance1', ports);

    expect(result.conversationsCreated).toBe(0);
    expect(result.messagesImported).toBe(1);
  });

  it('pula mensagens sem texto (media-only)', async () => {
    const ports = makePorts({
      chats: [chat('c1', '5511999999999@s.whatsapp.net')],
      messages: [
        { key: { id: 'm1', remoteJid: '5511999999999@s.whatsapp.net', fromMe: false }, messageTimestamp: 1700000000 },
        msg('m2', '5511999999999@s.whatsapp.net', false, 'Com texto'),
      ],
    });

    const result = await importWhatsAppHistory('t1', 'instance1', ports);

    expect(result.messagesImported).toBe(1);
  });

  it('retorna zero quando não há chats', async () => {
    const ports = makePorts({ chats: [] });

    const result = await importWhatsAppHistory('t1', 'instance1', ports);

    expect(result.chatsFound).toBe(0);
    expect(result.conversationsCreated).toBe(0);
    expect(result.messagesImported).toBe(0);
  });
});
