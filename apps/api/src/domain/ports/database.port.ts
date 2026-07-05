export interface ICustomerData {
  name: string;
  plan: string;
  status: string;
  monthly_value_cents: number;
  invoices: Array<{ id: string; amount_cents: number; status: string; due_date: string }>;
  tickets: Array<{ id: string; title: string; status: string; created_at: string }>;
}

export interface ITicketInput {
  tenant_id: string;
  customer_id: string;
  title: string;
  description: string;
  priority: string;
  source: string;
  conversation_id: string;
}

export interface IDatabasePort {
  fetchCustomer(customerId: string, tenantId: string): Promise<ICustomerData | null>;
  createTicket(input: ITicketInput): Promise<void>;
}
