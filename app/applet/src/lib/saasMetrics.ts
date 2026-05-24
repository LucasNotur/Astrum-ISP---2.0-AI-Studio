export interface Tenant {
  id: string;
  status: 'active' | 'suspended' | 'canceled';
  monthly_price: number;
}

export interface Ticket {
  id: string;
  tenant_id: string;
  resolved: boolean;
  escalated?: boolean;
  reopened_within_24h?: boolean;
  created_at: number;
  resolved_at?: number;
  human_first_response_at?: number;
}

export interface MetricRecord {
  date: string;
  mrr?: number;
  fcr?: number;
  tma?: number;
}

export interface DB {
  upsertMetric(date: string, data: Partial<MetricRecord>): Promise<void>;
}

export class SaasMetrics {
  constructor(private db: DB) {}

  calculateMRR(tenants: Tenant[]): number {
    if (!tenants || tenants.length === 0) return 0;
    return tenants
      .filter(t => t.status === 'active')
      .reduce((sum, t) => sum + t.monthly_price, 0);
  }

  calculateChurnRate(totalTenantsStart: number, canceledTenants: number): number {
    if (totalTenantsStart === 0) return 0; 
    return (canceledTenants / totalTenantsStart) * 100;
  }

  calculateFCR(tickets: Ticket[]): number {
    if (!tickets || tickets.length === 0) return 0;
    const resolvedFirstContact = tickets.filter(t => 
      t.resolved && !t.escalated && !t.reopened_within_24h
    ).length;
    return (resolvedFirstContact / tickets.length) * 100;
  }

  calculateTMA(tickets: Ticket[]): number {
    const resolvedTickets = tickets.filter(t => t.resolved && t.resolved_at && t.created_at);
    if (!resolvedTickets || resolvedTickets.length === 0) return 0;
    
    const totalTime = resolvedTickets.reduce((sum, t) => sum + (t.resolved_at! - t.created_at), 0);
    return totalTime / resolvedTickets.length;
  }

  calculateTMR(ticket: Ticket): number | null {
    if (ticket.human_first_response_at === undefined || ticket.human_first_response_at === null || isNaN(ticket.human_first_response_at)) {
      return null;
    }
    return ticket.human_first_response_at - ticket.created_at;
  }

  async runDailyJob(date: string, metrics: Partial<MetricRecord>): Promise<void> {
    await this.db.upsertMetric(date, metrics);
  }

  getTenantMetrics(tenantId: string, tickets: Ticket[]) {
    const tenantTickets = tickets.filter(t => t.tenant_id === tenantId);
    return {
      fcr: this.calculateFCR(tenantTickets),
      tma: this.calculateTMA(tenantTickets)
    };
  }
}
