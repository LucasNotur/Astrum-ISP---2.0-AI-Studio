export interface Ticket {
  id: string;
  tenant_id: string;
}

export interface BillingStatus {
  status: 'paid' | 'pending' | 'overdue';
  amount: number;
  due_date: string;
}

export interface ERPAdapter {
  getBillingStatus(customerId: string): Promise<BillingStatus>;
}

export class IXCAdapter implements ERPAdapter {
  async getBillingStatus(customerId: string): Promise<BillingStatus> {
    return { status: 'paid', amount: 100, due_date: '2026-05-24' };
  }
}

export class SGPAdapter implements ERPAdapter {
  async getBillingStatus(customerId: string): Promise<BillingStatus> {
    return { status: 'pending', amount: 150, due_date: '2026-06-01' };
  }
}

export class RBXAdapter implements ERPAdapter {
  async getBillingStatus(customerId: string): Promise<BillingStatus> {
    return { status: 'overdue', amount: 200, due_date: '2026-05-01' };
  }
}

export interface Dependencies {
  db: {
    getTenantByApiKey(apiKey: string): Promise<string | null>;
    getTicketsByTenant(tenantId: string): Promise<Ticket[]>;
    saveDailyReport(tenantId: string, date: string, pdfUrl: string): Promise<void>;
    getScraperLastMd5(url: string): Promise<string | null>;
    setScraperLastMd5(url: string, md5: string): Promise<void>;
  };
  redis: {
    incrementApiUsage(apiKey: string): Promise<number>;
  };
  pdf: {
    generate(tenantId: string, data: any, logoUrl: string): Promise<string>;
  };
  email: {
    send(to: string, subject: string): Promise<void>;
  };
  ai: {
    callAnthropic(prompt: string, temp: number): Promise<string>;
  };
}

export class Sprint18 {
  constructor(private deps: Dependencies) {}

  async getTickets(apiKey: string | undefined): Promise<{ status: number, data?: Ticket[] }> {
    if (!apiKey) return { status: 401 };

    const tenantId = await this.deps.db.getTenantByApiKey(apiKey);
    if (!tenantId) return { status: 401 };

    const usage = await this.deps.redis.incrementApiUsage(apiKey);
    if (usage > 1000) return { status: 429 };

    const tickets = await this.deps.db.getTicketsByTenant(tenantId);
    return { status: 200, data: tickets };
  }

  async runDailyReport(tenantId: string, date: string, logoUrl?: string): Promise<void> {
    const finalLogoUrl = logoUrl || 'https://placeholder.com/logo.png';
    const pdfUrl = await this.deps.pdf.generate(tenantId, {}, finalLogoUrl);
    await this.deps.db.saveDailyReport(tenantId, date, pdfUrl);
  }

  async loadMarketplaceIntegrations(integrations: { id: string, load: () => Promise<void> }[]): Promise<string[]> {
    const loaded: string[] = [];
    const promises = integrations.map(async (int) => {
      try {
        await int.load();
        loaded.push(int.id);
      } catch (e) {
        // ignore offline/failed
      }
    });

    await Promise.all(promises);
    return loaded;
  }

  async runScraper(url: string, newMd5: string): Promise<void> {
    const lastMd5 = await this.deps.db.getScraperLastMd5(url);
    if (lastMd5 === newMd5) {
      return; // Do not reindex or send email
    }

    await this.deps.db.setScraperLastMd5(url, newMd5);
    await this.deps.email.send('admin@empresa.com', 'Site updated');
  }

  async callAnthropicModel(prompt: string, configTemp: number): Promise<string> {
    // Anthropic recommended temp logic -> use fixed 0.7 if requested differently for certain cases, or just force 0.7
    return await this.deps.ai.callAnthropic(prompt, 0.7);
  }
}
