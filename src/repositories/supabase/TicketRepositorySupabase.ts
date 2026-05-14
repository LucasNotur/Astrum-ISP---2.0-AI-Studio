import { TicketRepository, Ticket, SessionState } from '../interfaces';

export class TicketRepositorySupabase implements TicketRepository {
  async findById(id: string): Promise<Ticket | null> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async findOpenByPhone(phone: string, tenantId: string): Promise<Ticket | null> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async create(data: Partial<Ticket>): Promise<Ticket> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async update(id: string, data: Partial<Ticket>): Promise<void> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async updateSessionState(id: string, state: Partial<SessionState>): Promise<void> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }
}
