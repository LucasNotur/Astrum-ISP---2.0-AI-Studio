/**
 * Dossiê #52 — Enfileiramento em cascata.
 * Quando nenhum operador do grupo primário atende em X segundos,
 * escala automaticamente para o próximo grupo na cadeia.
 */

export interface QueueGroup {
  id: string;
  name: string;
  operatorIds: string[];
  timeoutSeconds: number;
}

export interface CascadeConfig {
  tenantId: string;
  groups: QueueGroup[];
  fallbackAction: 'voicemail' | 'ai_agent' | 'callback';
}

export interface QueuedItem {
  conversationId: string;
  currentGroupIndex: number;
  enteredGroupAt: number;
  assignedTo?: string;
}

export interface CascadePorts {
  getAvailableOperators: (tenantId: string, operatorIds: string[]) => Promise<string[]>;
  assignToOperator: (tenantId: string, conversationId: string, operatorId: string) => Promise<void>;
  triggerFallback: (tenantId: string, conversationId: string, action: string) => Promise<void>;
}

export function selectOperator(available: string[]): string | null {
  return available.length > 0 ? available[Math.floor(Math.random() * available.length)] : null;
}

export function shouldEscalate(item: QueuedItem, group: QueueGroup, now: number): boolean {
  return (now - item.enteredGroupAt) / 1000 >= group.timeoutSeconds;
}

export async function processQueueItem(
  item: QueuedItem,
  config: CascadeConfig,
  ports: CascadePorts,
  now: number = Date.now(),
): Promise<{ action: 'assigned' | 'escalated' | 'fallback'; operatorId?: string; groupIndex: number }> {
  let groupIdx = item.currentGroupIndex;

  while (groupIdx < config.groups.length) {
    const group = config.groups[groupIdx];

    if (groupIdx === item.currentGroupIndex && !shouldEscalate(item, group, now)) {
      const available = await ports.getAvailableOperators(config.tenantId, group.operatorIds);
      const op = selectOperator(available);
      if (op) {
        await ports.assignToOperator(config.tenantId, item.conversationId, op);
        return { action: 'assigned', operatorId: op, groupIndex: groupIdx };
      }
      return { action: 'escalated', groupIndex: groupIdx };
    }

    if (groupIdx > item.currentGroupIndex || shouldEscalate(item, group, now)) {
      const available = await ports.getAvailableOperators(config.tenantId, group.operatorIds);
      const op = selectOperator(available);
      if (op) {
        await ports.assignToOperator(config.tenantId, item.conversationId, op);
        return { action: 'assigned', operatorId: op, groupIndex: groupIdx };
      }
      groupIdx++;
      continue;
    }

    groupIdx++;
  }

  await ports.triggerFallback(config.tenantId, item.conversationId, config.fallbackAction);
  return { action: 'fallback', groupIndex: config.groups.length };
}
