export interface Customer {
  id: string;
  plan: 'FREE' | 'PRO' | 'ENTERPRISE';
  conditions_met: string[]; // e.g., ['high_traffic', 'needs_api', 'wants_custom_domain']
}

export interface UpsellDecision {
  should_upsell: boolean;
  suggested_plan?: 'PRO' | 'ENTERPRISE';
}

export interface FirestoreDB {
  saveUpsellEvent(customerId: string, plan: string, outcome: string): Promise<void>;
  saveCsatRating(ticketId: string, rating: number): Promise<void>;
  closeTicket(ticketId: string): Promise<void>;
  scheduleNpsJob(ticketId: string, delayMs: number): Promise<void>;
}

export class UpsellEngine {
  constructor(private db: FirestoreDB) {}

  evaluateUpsell(customer: Customer): UpsellDecision {
    if (customer.plan === 'ENTERPRISE') {
      return { should_upsell: false };
    }

    if (customer.conditions_met.length >= 2) {
      return {
        should_upsell: true,
        suggested_plan: customer.plan === 'FREE' ? 'PRO' : 'ENTERPRISE'
      };
    }

    return { should_upsell: false };
  }

  async recordUpsellOffer(customerId: string, suggestedPlan: string, outcome: 'interested' | 'rejected'): Promise<void> {
    await this.db.saveUpsellEvent(customerId, suggestedPlan, outcome);
  }

  async processCustomerMessage(ticketId: string, message: string): Promise<boolean> {
    const trimmed = message.trim();
    // 1-5 only
    if (/^[1-5]$/.test(trimmed)) {
      const rating = parseInt(trimmed, 10);
      await this.db.saveCsatRating(ticketId, rating);
      await this.db.closeTicket(ticketId);
      return true; // handled as NPS
    }

    return false; // not handled as NPS
  }

  async requestNPS(ticketId: string): Promise<void> {
    // Schedule job to request NPS after 24 hours (e.g. 24*60*60*1000)
    await this.db.scheduleNpsJob(ticketId, 86400000);
  }
}
