export interface Ticket {
  id: string;
  tenant_id: string;
  status: 'open' | 'closed' | 'snoozed';
  snoozed_until?: number;
  snoozed_by?: string;
  created_at: number;
}

export interface NotificationService {
  sendPush(operatorId: string, message: string): Promise<void>;
}

export interface TicketRepository {
  getSnoozedTickets(): Promise<Ticket[]>;
  updateTicketStatus(ticketId: string, status: string): Promise<void>;
  getActiveTickets(operatorId: string): Promise<Ticket[]>;
}

export class SnoozeChecker {
  constructor(
    private ticketRepo: TicketRepository,
    private notificationService: NotificationService
  ) {}

  async checkSnoozedTickets(currentTimeMs: number = Date.now()): Promise<void> {
    const snoozedTickets = await this.ticketRepo.getSnoozedTickets();

    for (const ticket of snoozedTickets) {
      if (ticket.status === 'snoozed' && ticket.snoozed_until && ticket.snoozed_until <= currentTimeMs) {
        await this.ticketRepo.updateTicketStatus(ticket.id, 'open');
        ticket.status = 'open';
        
        if (ticket.snoozed_by) {
          await this.notificationService.sendPush(ticket.snoozed_by, `Ticket ${ticket.id} awake!`);
        }
      }
    }
  }
}
