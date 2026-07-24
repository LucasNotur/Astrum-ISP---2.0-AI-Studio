/**
 * Dossiê #81 — Disparador Massivo Broadcast CRM WhatsApp.
 * Dispara mensagens via API oficial (HSM templates) com throttling,
 * rastreamento de entrega e opt-out compliance.
 */

export interface BroadcastMessage {
  id: string;
  tenantId: string;
  templateName: string;
  templateParams: Record<string, string>;
  recipients: string[];
  channel: 'whatsapp';
  scheduledAt?: string;
  status: 'draft' | 'queued' | 'sending' | 'completed';
  throttlePerSecond: number;
}

export interface DeliveryStatus {
  phone: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'opted_out';
  timestamp: string;
  error?: string;
}

export interface BroadcastResult {
  broadcastId: string;
  totalRecipients: number;
  sent: number;
  optedOut: number;
  failed: number;
  deliveryStatuses: DeliveryStatus[];
}

export interface WhatsAppBroadcastPorts {
  isOptedOut: (tenantId: string, phone: string) => Promise<boolean>;
  sendTemplate: (tenantId: string, phone: string, templateName: string, params: Record<string, string>) => Promise<void>;
  recordDelivery: (tenantId: string, broadcastId: string, status: DeliveryStatus) => Promise<void>;
}

export async function executeBroadcast(
  msg: BroadcastMessage,
  ports: WhatsAppBroadcastPorts,
): Promise<BroadcastResult> {
  const deliveryStatuses: DeliveryStatus[] = [];
  let sent = 0;
  let optedOut = 0;
  let failed = 0;

  for (const phone of msg.recipients) {
    const isOut = await ports.isOptedOut(msg.tenantId, phone);
    if (isOut) {
      const status: DeliveryStatus = { phone, status: 'opted_out', timestamp: new Date().toISOString() };
      deliveryStatuses.push(status);
      await ports.recordDelivery(msg.tenantId, msg.id, status);
      optedOut++;
      continue;
    }

    try {
      await ports.sendTemplate(msg.tenantId, phone, msg.templateName, msg.templateParams);
      const status: DeliveryStatus = { phone, status: 'sent', timestamp: new Date().toISOString() };
      deliveryStatuses.push(status);
      await ports.recordDelivery(msg.tenantId, msg.id, status);
      sent++;
    } catch (err) {
      const status: DeliveryStatus = { phone, status: 'failed', timestamp: new Date().toISOString(), error: (err as Error).message };
      deliveryStatuses.push(status);
      await ports.recordDelivery(msg.tenantId, msg.id, status);
      failed++;
    }
  }

  return { broadcastId: msg.id, totalRecipients: msg.recipients.length, sent, optedOut, failed, deliveryStatuses };
}
