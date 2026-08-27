import { sendMessage } from './whatsapp.adapter';
import { makeMultiConnPorts } from './multi-connection-ports.adapter';
import { sendViaAvailableConnection } from '../../domain/atendimento/multi-connection.service';
import { resolveTenantKeys } from '../../lib/tenant-keys';
import { atendimentoLogger } from '../../infrastructure/logging/logger';

/**
 * Serviço de envio de mensagens WhatsApp.
 * Adiciona formatação, retry e logging sobre o adapter base.
 */

const MAX_MESSAGE_LENGTH = 4096; // limite WhatsApp

/**
 * Divide mensagem longa em partes para o WhatsApp.
 */
function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      parts.push(remaining);
      break;
    }

    // Cortar na última frase dentro do limite
    const slice = remaining.slice(0, MAX_MESSAGE_LENGTH);
    const lastPeriod = slice.lastIndexOf('. ');
    const cutAt = lastPeriod > 0 ? lastPeriod + 2 : MAX_MESSAGE_LENGTH;

    parts.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }

  return parts;
}

export interface SendWhatsAppOptions {
  to: string;           // número do destinatário
  content: string;      // texto da resposta
  tenantId: string;
  conversationId?: string;
  instanceName?: string;
}

export async function sendWhatsAppResponse(opts: SendWhatsAppOptions): Promise<void> {
  const { to, content, tenantId, conversationId, instanceName } = opts;

  // Chaves BYOK do tenant resolvidas UMA vez (não por parte da mensagem).
  const { evolutionUrl, evolutionApiKey } = await resolveTenantKeys(tenantId);

  // Roteamento multi-conexão (Dossiê #58): responde pelo MESMO número que o
  // cliente usou (preferredInstance) enquanto ele estiver saudável; se cair
  // no meio do envio, faz failover pra outra conexão do tenant. Tenant sem
  // nenhuma linha em tenant_evolution_instances (não devia acontecer pra
  // quem já tem WhatsApp — migration 123 fez backfill — mas fail-open pra
  // não regredir um caso de borda) cai pro envio direto de sempre.
  const ports = makeMultiConnPorts(tenantId, evolutionUrl, evolutionApiKey, instanceName);
  const hasRegisteredConnections = (await ports.listConnections(tenantId)).length > 0;

  const parts = splitMessage(content);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? '';
    const routed = hasRegisteredConnections
      ? await sendViaAvailableConnection(tenantId, to, part, ports)
      : await sendMessage({ to, content: part, tenantId, instanceName, evolutionUrl, evolutionApiKey })
          .then((r) => ({ ok: r.status !== 'fallback', messageId: r.messageId, connectionId: instanceName }));

    if (!routed.ok) {
      atendimentoLogger.warn(
        { tenantId, conversationId, part: i + 1, total: parts.length, error: (routed as any).error },
        'Mensagem WhatsApp em modo fallback (Evolution API indisponível / nenhuma conexão saudável)'
      );
    } else {
      atendimentoLogger.info(
        { tenantId, conversationId, messageId: routed.messageId, instanceUsed: routed.connectionId, part: i + 1 },
        'Mensagem WhatsApp enviada'
      );
    }

    // Pausa entre partes para não parecer spam
    if (parts.length > 1 && i < parts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
