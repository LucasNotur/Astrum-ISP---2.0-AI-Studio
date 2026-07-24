/**
 * Dossiê #88 — Campanha Broadcast Retencional.
 * Dispara mensagens em massa para clientes com risco de churn,
 * com personalização por segmento e throttling.
 */

export interface RetentionCampaign {
  id: string;
  tenantId: string;
  name: string;
  segmentFilter: { churnRiskMin: number; churnRiskMax: number; planTier?: string };
  messageTemplate: string;
  channel: 'whatsapp' | 'sms' | 'email';
  scheduledAt: string;
  status: 'draft' | 'scheduled' | 'running' | 'completed';
  throttlePerMinute: number;
}

export interface CampaignTarget {
  customerId: string;
  customerName: string;
  phone: string;
  churnRisk: number;
  plan: string;
}

export interface CampaignResult {
  campaignId: string;
  totalTargets: number;
  sent: number;
  failed: number;
  errors: Array<{ customerId: string; error: string }>;
}

export interface BroadcastPorts {
  getTargets: (tenantId: string, filter: RetentionCampaign['segmentFilter']) => Promise<CampaignTarget[]>;
  sendMessage: (tenantId: string, target: CampaignTarget, message: string, channel: string) => Promise<void>;
  updateCampaignStatus: (campaignId: string, status: RetentionCampaign['status']) => Promise<void>;
}

export function personalizeMessage(template: string, target: CampaignTarget): string {
  return template
    .replace(/\{\{nome\}\}/g, target.customerName)
    .replace(/\{\{plano\}\}/g, target.plan)
    .replace(/\{\{risco\}\}/g, `${Math.round(target.churnRisk * 100)}%`);
}

export async function executeCampaign(
  campaign: RetentionCampaign,
  ports: BroadcastPorts,
): Promise<CampaignResult> {
  await ports.updateCampaignStatus(campaign.id, 'running');

  const targets = await ports.getTargets(campaign.tenantId, campaign.segmentFilter);
  let sent = 0;
  const errors: CampaignResult['errors'] = [];

  for (const target of targets) {
    try {
      const message = personalizeMessage(campaign.messageTemplate, target);
      await ports.sendMessage(campaign.tenantId, target, message, campaign.channel);
      sent++;
    } catch (err) {
      errors.push({ customerId: target.customerId, error: (err as Error).message });
    }
  }

  await ports.updateCampaignStatus(campaign.id, 'completed');

  return { campaignId: campaign.id, totalTargets: targets.length, sent, failed: errors.length, errors };
}
