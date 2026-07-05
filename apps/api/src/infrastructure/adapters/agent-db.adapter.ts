import { supabase } from '../database/supabase.client';
import { IDatabasePort, ICustomerData, ITicketInput } from '../../domain/ports/database.port';

export const agentDbAdapter: IDatabasePort = {
  async fetchCustomer(customerId, tenantId): Promise<ICustomerData | null> {
    const { data } = await supabase
      .from('customers')
      .select(`
        name, plan, status, monthly_value_cents,
        invoices(id, amount_cents, status, due_date),
        tickets(id, title, status, created_at)
      `)
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .single();
    return data as ICustomerData | null;
  },

  async createTicket(input: ITicketInput): Promise<void> {
    await supabase.from('tickets').insert(input);
  },
};
