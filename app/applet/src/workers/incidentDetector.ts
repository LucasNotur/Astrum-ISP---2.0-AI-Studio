export interface OSRequest {
  customerId: string;
  ctoId: string;
  timestamp: number;
}

export interface Customer {
  id: string;
  phone?: string;
}

export interface Incident {
  id: string;
  ctoId: string;
  status: 'active' | 'resolved';
}

export interface Ticket {
  id: string;
  incidentId: string;
  status: 'open' | 'closed';
}

export interface SystemDependencies {
  db: {
    getRecentOSCount: (ctoId: string, since: number) => Promise<number>;
    createOS: (request: OSRequest) => Promise<void>;
    getActiveIncident: (ctoId: string) => Promise<Incident | null>;
    createIncident: (ctoId: string) => Promise<Incident>;
    getCustomersByCTO: (ctoId: string) => Promise<Customer[]>;
    queueNotification: (customerId: string, message: string) => Promise<void>;
    updateIncidentStatus: (incidentId: string, status: string) => Promise<void>;
    getOpenTicketsForIncident: (incidentId: string) => Promise<Ticket[]>;
    closeTicket: (ticketId: string) => Promise<void>;
  }
}

export class IncidentDetector {
  constructor(private deps: SystemDependencies) {}

  async handleOSRequest(request: OSRequest): Promise<{ status: string; incidentId?: string }> {
    const activeIncident = await this.deps.db.getActiveIncident(request.ctoId);
    if (activeIncident) {
      return { status: 'incident_referenced', incidentId: activeIncident.id };
    }

    const tenMinutesAgo = request.timestamp - 10 * 60 * 1000;
    const recentCount = await this.deps.db.getRecentOSCount(request.ctoId, tenMinutesAgo);

    if (recentCount >= 4) { // 4 existing + 1 new = 5
      const incident = await this.deps.db.createIncident(request.ctoId);
      const customers = await this.deps.db.getCustomersByCTO(request.ctoId);
      
      for (const customer of customers) {
        if (!customer.phone) continue;
        try {
          await this.deps.db.queueNotification(customer.id, 'Estamos com uma falha na sua região.');
        } catch (e) {
          // ignore
        }
      }

      return { status: 'macro_incident_created', incidentId: incident.id };
    }

    await this.deps.db.createOS(request);
    return { status: 'os_created' };
  }

  async resolveIncident(incidentId: string, ctoId: string) {
    await this.deps.db.updateIncidentStatus(incidentId, 'resolved');
    
    const customers = await this.deps.db.getCustomersByCTO(ctoId);
    for (const customer of customers) {
      if (!customer.phone) continue;
      try {
        await this.deps.db.queueNotification(customer.id, 'A falha na sua região foi resolvida.');
      } catch (e) {
        // ignore
      }
    }

    const openTickets = await this.deps.db.getOpenTicketsForIncident(incidentId);
    for (const ticket of openTickets) {
      await this.deps.db.closeTicket(ticket.id);
    }
  }
}
