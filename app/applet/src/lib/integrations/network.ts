export interface ERPAdapter {
  getCTOStatus(ctoId: string): Promise<{ status: string, affected_customers: string[] }>;
  unlockCustomer(customerId: string): Promise<void>;
  checkPayment(customerId: string): Promise<boolean>;
  syncCustomer(customerId: string, data: any): Promise<void>;
}

export interface Services {
  erp: ERPAdapter;
  whatsapp: { sendMessage: (phone: string, msg: string) => Promise<void> };
  incidentDb: {
    getActiveIncident: (ctoId: string) => Promise<any>;
    createIncident: (ctoId: string, affected: string[]) => Promise<void>;
  };
  ticketDb: { closeTicket: (ticketId: string) => Promise<void> };
  syncDb: {
    markPendingSync: (customerId: string, data: any) => Promise<void>;
    getPendingSyncs: () => Promise<Array<{customerId: string, data: any}>>;
    clearPendingSync: (customerId: string) => Promise<void>;
  };
}

export class NetworkService {
  constructor(private services: Services) {}

  async getCTOStatus(ctoId: string) {
    return await this.services.erp.getCTOStatus(ctoId);
  }

  async checkNetworkStatus(ctoId: string) {
    const cto = await this.getCTOStatus(ctoId);
    if (cto.status === 'down') {
      const activeIncident = await this.services.incidentDb.getActiveIncident(ctoId);
      if (!activeIncident) {
        await this.services.incidentDb.createIncident(ctoId, cto.affected_customers);
      }
    }
  }

  // 4. Sequence must be exactly: checkPayment -> unlockCustomer -> whatsapp -> closeTicket
  async unlockCustomerSequence(customerId: string, ticketId: string, phone: string) {
    const hasPaid = await this.services.erp.checkPayment(customerId);
    if (!hasPaid) {
      throw new Error('Payment not confirmed');
    }
    
    await this.services.erp.unlockCustomer(customerId);
    await this.services.whatsapp.sendMessage(phone, 'Sinal desbloqueado.');
    await this.services.ticketDb.closeTicket(ticketId);
  }

  // 6. Cadastral sync
  async syncCustomerData(customerId: string, data: any) {
    try {
      await this.services.erp.syncCustomer(customerId, data);
    } catch (e) {
      await this.services.syncDb.markPendingSync(customerId, data);
    }
  }

  // 7. Retry pending sync
  async retryPendingSyncs() {
    const pending = await this.services.syncDb.getPendingSyncs();
    for (const p of pending) {
      try {
        await this.services.erp.syncCustomer(p.customerId, p.data);
        await this.services.syncDb.clearPendingSync(p.customerId);
      } catch (e) {
        // Do nothing, still pending
      }
    }
  }
}
