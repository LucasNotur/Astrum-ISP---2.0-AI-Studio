/**
 * Dossiê #59 — Agrupamento de Conversas Cross-Line (Entidade Unificada).
 * Quando o mesmo cliente entra em contato por múltiplos canais (WhatsApp, Email,
 * Portal), agrupa as conversas sob uma única entidade de atendimento.
 */

export interface UnifiedContact {
  id: string;
  tenantId: string;
  customerId: string;
  identifiers: Array<{ channel: string; value: string }>;
  conversations: string[];
  mergedAt?: string;
}

export interface CrossLinePorts {
  findContactByIdentifier: (tenantId: string, channel: string, value: string) => Promise<UnifiedContact | null>;
  createUnifiedContact: (tenantId: string, customerId: string, identifiers: Array<{ channel: string; value: string }>) => Promise<UnifiedContact>;
  mergeContacts: (tenantId: string, primaryId: string, secondaryId: string) => Promise<UnifiedContact>;
  linkConversation: (contactId: string, conversationId: string) => Promise<void>;
}

export function matchIdentifiers(
  a: Array<{ channel: string; value: string }>,
  b: Array<{ channel: string; value: string }>,
): boolean {
  for (const ia of a) {
    for (const ib of b) {
      if (ia.channel === ib.channel && ia.value.toLowerCase() === ib.value.toLowerCase()) return true;
    }
  }
  return false;
}

export function deduplicateIdentifiers(
  identifiers: Array<{ channel: string; value: string }>,
): Array<{ channel: string; value: string }> {
  const seen = new Set<string>();
  return identifiers.filter((id) => {
    const key = `${id.channel}:${id.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function resolveUnifiedContact(
  tenantId: string,
  customerId: string,
  channel: string,
  channelValue: string,
  conversationId: string,
  ports: CrossLinePorts,
): Promise<UnifiedContact> {
  const existing = await ports.findContactByIdentifier(tenantId, channel, channelValue);

  if (existing) {
    await ports.linkConversation(existing.id, conversationId);
    return existing;
  }

  const contact = await ports.createUnifiedContact(tenantId, customerId, [{ channel, value: channelValue }]);
  await ports.linkConversation(contact.id, conversationId);
  return contact;
}
