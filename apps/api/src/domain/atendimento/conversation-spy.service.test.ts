import { describe, it, expect, vi } from 'vitest';
import { startSpying, sendWhisperMessage, takeoverConversation, SpyPorts, SpySession } from './conversation-spy.service';

function makePorts(hasPermission = true): SpyPorts {
  return {
    getActiveSession: vi.fn().mockResolvedValue(null),
    createSession: vi.fn().mockImplementation(async (cid, sid, mode) => ({
      sessionId: 's1', conversationId: cid, supervisorId: sid, mode, startedAt: new Date().toISOString(),
    })),
    endSession: vi.fn().mockResolvedValue(undefined),
    sendWhisper: vi.fn().mockResolvedValue(undefined),
    takeoverConversation: vi.fn().mockResolvedValue(undefined),
    hasPermission: vi.fn().mockResolvedValue(hasPermission),
  };
}

const SESSION: SpySession = {
  sessionId: 's1', conversationId: 'c1', supervisorId: 'sup1', mode: 'whisper', startedAt: '2026-07-22',
};

describe('conversation-spy.service', () => {
  describe('startSpying', () => {
    it('cria sessão com permissão', async () => {
      const ports = makePorts();
      const result = await startSpying('t1', 'c1', 'sup1', 'observe', ports);
      expect(result.ok).toBe(true);
      expect(result.session?.mode).toBe('observe');
    });

    it('rejeita sem permissão', async () => {
      const ports = makePorts(false);
      const result = await startSpying('t1', 'c1', 'sup1', 'takeover', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('permissão');
    });

    it('reutiliza sessão existente', async () => {
      const ports = makePorts();
      (ports.getActiveSession as any).mockResolvedValue(SESSION);
      const result = await startSpying('t1', 'c1', 'sup1', 'whisper', ports);
      expect(result.ok).toBe(true);
      expect(ports.createSession).not.toHaveBeenCalled();
    });
  });

  describe('sendWhisperMessage', () => {
    it('envia whisper em modo whisper', async () => {
      const ports = makePorts();
      const result = await sendWhisperMessage(SESSION, 'op1', 'Ofereça desconto', ports);
      expect(result.ok).toBe(true);
      expect(ports.sendWhisper).toHaveBeenCalledWith('c1', 'op1', 'Ofereça desconto');
    });

    it('bloqueia whisper em modo observe', async () => {
      const ports = makePorts();
      const observeSession = { ...SESSION, mode: 'observe' as const };
      const result = await sendWhisperMessage(observeSession, 'op1', 'Teste', ports);
      expect(result.ok).toBe(false);
    });
  });

  describe('takeoverConversation', () => {
    it('executa takeover no modo correto', async () => {
      const ports = makePorts();
      const takeoverSession = { ...SESSION, mode: 'takeover' as const };
      const result = await takeoverConversation(takeoverSession, ports);
      expect(result.ok).toBe(true);
      expect(ports.takeoverConversation).toHaveBeenCalledOnce();
    });

    it('bloqueia takeover em modo observe', async () => {
      const ports = makePorts();
      const observeSession = { ...SESSION, mode: 'observe' as const };
      const result = await takeoverConversation(observeSession, ports);
      expect(result.ok).toBe(false);
    });
  });
});
