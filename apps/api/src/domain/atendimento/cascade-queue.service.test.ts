import { describe, it, expect, vi } from 'vitest';
import { shouldEscalate, processQueueItem, CascadeConfig, CascadePorts, QueuedItem } from './cascade-queue.service';

const CONFIG: CascadeConfig = {
  tenantId: 't1',
  groups: [
    { id: 'g1', name: 'Nível 1', operatorIds: ['op1', 'op2'], timeoutSeconds: 30 },
    { id: 'g2', name: 'Nível 2', operatorIds: ['op3', 'op4'], timeoutSeconds: 60 },
    { id: 'g3', name: 'Supervisão', operatorIds: ['sup1'], timeoutSeconds: 120 },
  ],
  fallbackAction: 'ai_agent',
};

function makePorts(available: Record<string, string[]> = {}): CascadePorts {
  return {
    getAvailableOperators: vi.fn().mockImplementation(async (_, ids: string[]) => {
      for (const id of ids) {
        if (available[id]) return [id];
      }
      return [];
    }),
    assignToOperator: vi.fn().mockResolvedValue(undefined),
    triggerFallback: vi.fn().mockResolvedValue(undefined),
  };
}

describe('cascade-queue.service', () => {
  describe('shouldEscalate', () => {
    it('true quando timeout atingido', () => {
      const item: QueuedItem = { conversationId: 'c1', currentGroupIndex: 0, enteredGroupAt: 1000 };
      expect(shouldEscalate(item, CONFIG.groups[0], 32000)).toBe(true);
    });

    it('false antes do timeout', () => {
      const item: QueuedItem = { conversationId: 'c1', currentGroupIndex: 0, enteredGroupAt: 1000 };
      expect(shouldEscalate(item, CONFIG.groups[0], 20000)).toBe(false);
    });
  });

  describe('processQueueItem', () => {
    it('atribui operador disponível no grupo atual', async () => {
      const ports = makePorts({ op1: ['op1'] });
      const item: QueuedItem = { conversationId: 'c1', currentGroupIndex: 0, enteredGroupAt: Date.now() };
      const result = await processQueueItem(item, CONFIG, ports);
      expect(result.action).toBe('assigned');
      expect(result.groupIndex).toBe(0);
      expect(ports.assignToOperator).toHaveBeenCalledOnce();
    });

    it('escala para próximo grupo quando timeout e ninguém disponível no atual', async () => {
      const ports = makePorts({ op3: ['op3'] });
      const now = Date.now();
      const item: QueuedItem = { conversationId: 'c1', currentGroupIndex: 0, enteredGroupAt: now - 35000 };
      const result = await processQueueItem(item, CONFIG, ports, now);
      expect(result.action).toBe('assigned');
      expect(result.groupIndex).toBe(1);
    });

    it('aciona fallback quando nenhum grupo atende', async () => {
      const ports = makePorts({});
      const now = Date.now();
      const item: QueuedItem = { conversationId: 'c1', currentGroupIndex: 0, enteredGroupAt: now - 200000 };
      const result = await processQueueItem(item, CONFIG, ports, now);
      expect(result.action).toBe('fallback');
      expect(ports.triggerFallback).toHaveBeenCalledWith('t1', 'c1', 'ai_agent');
    });
  });
});
