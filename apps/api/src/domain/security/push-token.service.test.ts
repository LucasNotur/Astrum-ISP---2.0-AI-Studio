import { describe, it, expect, vi } from 'vitest';
import {
  deduplicateTokens, groupByPlatform,
  registerPushToken, sendPushToUser,
  PushToken, PushPorts,
} from './push-token.service';

const TOKENS: PushToken[] = [
  { id: 'pt-1', tenantId: 't1', userId: 'u1', token: 'token-ios-abc123', platform: 'ios', deviceName: 'iPhone 15', lastUsedAt: '2026-07-22T10:00:00Z', createdAt: '2026-07-20', isActive: true },
  { id: 'pt-2', tenantId: 't1', userId: 'u1', token: 'token-android-xyz', platform: 'android', deviceName: 'Pixel 8', lastUsedAt: '2026-07-21T10:00:00Z', createdAt: '2026-07-19', isActive: true },
  { id: 'pt-3', tenantId: 't1', userId: 'u1', token: 'token-web-000111', platform: 'web', lastUsedAt: '2026-07-20T10:00:00Z', createdAt: '2026-07-18', isActive: true },
];

function makePorts(): PushPorts {
  return {
    listTokens: vi.fn().mockResolvedValue(TOKENS),
    registerToken: vi.fn().mockImplementation(async (data) => ({ id: 'pt-new', createdAt: '2026-07-22', ...data })),
    deactivateToken: vi.fn().mockResolvedValue(undefined),
    deactivateAllForUser: vi.fn().mockResolvedValue(3),
    sendPush: vi.fn().mockResolvedValue({ sent: 3, failed: 0 }),
  };
}

describe('push-token.service', () => {
  describe('deduplicateTokens', () => {
    it('mantém o mais recente de tokens duplicados', () => {
      const dup: PushToken[] = [
        { ...TOKENS[0], lastUsedAt: '2026-07-20T10:00:00Z' },
        { ...TOKENS[0], id: 'pt-1b', lastUsedAt: '2026-07-22T10:00:00Z' },
      ];
      const deduped = deduplicateTokens(dup);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].id).toBe('pt-1b');
    });
  });

  describe('groupByPlatform', () => {
    it('agrupa por plataforma', () => {
      const grouped = groupByPlatform(TOKENS);
      expect(grouped.ios).toHaveLength(1);
      expect(grouped.android).toHaveLength(1);
      expect(grouped.web).toHaveLength(1);
    });
  });

  describe('registerPushToken', () => {
    it('registra novo token', async () => {
      const ports = makePorts();
      const result = await registerPushToken('t1', 'u1', 'new-token-abcdef1234', 'ios', 'iPhone', ports);
      expect(result.ok).toBe(true);
      expect(result.evicted).toBe(0);
    });

    it('retorna existente se duplicado', async () => {
      const ports = makePorts();
      const result = await registerPushToken('t1', 'u1', 'token-ios-abc123', 'ios', 'iPhone', ports);
      expect(result.ok).toBe(true);
      expect(ports.registerToken).not.toHaveBeenCalled();
    });

    it('rejeita token muito curto', async () => {
      const ports = makePorts();
      const result = await registerPushToken('t1', 'u1', 'short', 'ios', undefined, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('inválido');
    });

    it('evicta token mais antigo quando no limite', async () => {
      const ports = makePorts();
      const manyTokens = Array.from({ length: 10 }, (_, i) => ({
        ...TOKENS[0], id: `pt-${i}`, token: `token-${i}-xxxx12345`,
        lastUsedAt: `2026-07-${String(10 + i).padStart(2, '0')}T10:00:00Z`,
      }));
      (ports.listTokens as any).mockResolvedValue(manyTokens);
      const result = await registerPushToken('t1', 'u1', 'brand-new-token1234', 'android', 'Pixel', ports);
      expect(result.ok).toBe(true);
      expect(result.evicted).toBe(1);
      expect(ports.deactivateToken).toHaveBeenCalled();
    });
  });

  describe('sendPushToUser', () => {
    it('envia para todos os tokens ativos', async () => {
      const ports = makePorts();
      const result = await sendPushToUser('t1', 'u1', 'Novo ticket', 'Ticket #123 aberto', undefined, ports);
      expect(result.ok).toBe(true);
      expect(result.sent).toBe(3);
    });

    it('falha sem tokens ativos', async () => {
      const ports = makePorts();
      (ports.listTokens as any).mockResolvedValue([]);
      const result = await sendPushToUser('t1', 'u1', 'Test', 'Body', undefined, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Nenhum token');
    });

    it('filtra tokens inativos', async () => {
      const ports = makePorts();
      const mixed = [TOKENS[0], { ...TOKENS[1], isActive: false }];
      (ports.listTokens as any).mockResolvedValue(mixed);
      await sendPushToUser('t1', 'u1', 'Test', 'Body', undefined, ports);
      expect(ports.sendPush).toHaveBeenCalledWith(['token-ios-abc123'], 'Test', 'Body', undefined);
    });
  });
});
