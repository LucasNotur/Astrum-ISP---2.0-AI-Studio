/**
 * Dossiê #87 — Follow-Up Lead Management Automático via IA.
 * Detecta leads sem interação, agenda follow-ups automáticos,
 * e gera mensagens personalizadas via LLM.
 */

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost' | 'stale';

export interface Lead {
  id: string;
  tenantId: string;
  customerName: string;
  phone: string;
  status: LeadStatus;
  lastContactAt: string;
  createdAt: string;
  interest?: string;
  assignedTo?: string;
}

export interface FollowUpAction {
  leadId: string;
  action: 'send_message' | 'schedule_call' | 'mark_stale';
  message?: string;
  scheduledFor?: string;
}

export interface FollowUpConfig {
  staleAfterDays: number;
  followUpIntervalDays: number;
  maxFollowUps: number;
}

export const DEFAULT_FOLLOWUP_CONFIG: FollowUpConfig = {
  staleAfterDays: 7,
  followUpIntervalDays: 2,
  maxFollowUps: 3,
};

export interface LeadFollowUpPorts {
  getActiveLeads: (tenantId: string) => Promise<Lead[]>;
  getFollowUpCount: (tenantId: string, leadId: string) => Promise<number>;
  generateMessage: (lead: Lead, attemptNumber: number) => Promise<string>;
  sendFollowUp: (tenantId: string, leadId: string, message: string) => Promise<void>;
  markStale: (tenantId: string, leadId: string) => Promise<void>;
}

function daysSince(dateStr: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(dateStr).getTime()) / 86_400_000);
}

export function classifyLead(lead: Lead, followUpCount: number, cfg: FollowUpConfig, now: Date): FollowUpAction | null {
  const daysSinceContact = daysSince(lead.lastContactAt, now);

  if (lead.status === 'won' || lead.status === 'lost' || lead.status === 'stale') return null;

  if (daysSinceContact >= cfg.staleAfterDays && followUpCount >= cfg.maxFollowUps) {
    return { leadId: lead.id, action: 'mark_stale' };
  }

  if (daysSinceContact >= cfg.followUpIntervalDays && followUpCount < cfg.maxFollowUps) {
    return { leadId: lead.id, action: 'send_message' };
  }

  return null;
}

export async function processFollowUps(
  tenantId: string,
  ports: LeadFollowUpPorts,
  cfg: FollowUpConfig = DEFAULT_FOLLOWUP_CONFIG,
  now: Date = new Date(),
): Promise<FollowUpAction[]> {
  const leads = await ports.getActiveLeads(tenantId);
  const actions: FollowUpAction[] = [];

  for (const lead of leads) {
    const count = await ports.getFollowUpCount(tenantId, lead.id);
    const action = classifyLead(lead, count, cfg, now);
    if (!action) continue;

    if (action.action === 'send_message') {
      const message = await ports.generateMessage(lead, count + 1);
      await ports.sendFollowUp(tenantId, lead.id, message);
      action.message = message;
    } else if (action.action === 'mark_stale') {
      await ports.markStale(tenantId, lead.id);
    }

    actions.push(action);
  }

  return actions;
}
