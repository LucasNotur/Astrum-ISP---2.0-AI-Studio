export interface Customer {
  id?: string;
  phone_number?: string;
  cpf?: string;
  name?: string;
  tenant_id?: string;
  [key: string]: any;
}

export interface Ticket {
  id?: string;
  phone_number?: string;
  tenant_id?: string;
  status?: string;
  session_state?: SessionState;
  [key: string]: any;
}

export interface SessionState {
  awaiting_cpf?: boolean;
  awaiting_name?: boolean;
  awaiting_photo?: boolean;
  awaiting_audio?: boolean;
  photo_type?: string;
  cpf_error_count?: number;
  [key: string]: any;
}

export interface ServiceOrder {
  id?: string;
  customer_id?: string;
  tenant_id?: string;
  status?: string;
  date?: string | Date;
  [key: string]: any;
}

export interface KnowledgeArticle {
  id?: string;
  tenant_id?: string;
  title?: string;
  content?: string;
  category?: string;
  vector_indexed?: boolean;
  [key: string]: any;
}

export interface Tenant {
  id?: string;
  name?: string;
  [key: string]: any;
}

export interface TenantRepository {
  findById(id: string): Promise<Tenant | null>;
}

export interface CustomerRepository {
  findById(id: string, tenantId: string): Promise<Customer | null>;
  findByPhone(phone: string, tenantId: string): Promise<Customer | null>;
  findByCpf(cpf: string, tenantId: string): Promise<Customer | null>;
  create(data: Partial<Customer>): Promise<Customer>;
  update(id: string, data: Partial<Customer>): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface TicketRepository {
  findById(id: string): Promise<Ticket | null>;
  findOpenByPhone(phone: string, tenantId: string): Promise<Ticket | null>;
  create(data: Partial<Ticket>): Promise<Ticket>;
  update(id: string, data: Partial<Ticket>): Promise<void>;
  updateSessionState(id: string, state: Partial<SessionState>): Promise<void>;
}

export interface ServiceOrderRepository {
  findById(id: string): Promise<ServiceOrder | null>;
  findOpenByCustomer(customerId: string, tenantId: string): Promise<ServiceOrder[]>;
  findByDateRange(tenantId: string, start: Date, end: Date): Promise<ServiceOrder[]>;
  create(data: Partial<ServiceOrder>): Promise<ServiceOrder>;
  update(id: string, data: Partial<ServiceOrder>): Promise<void>;
}

export interface KnowledgeRepository {
  search(query: string, tenantId: string): Promise<KnowledgeArticle[]>;
  findAll(tenantId: string): Promise<KnowledgeArticle[]>;
  create(data: Partial<KnowledgeArticle>): Promise<KnowledgeArticle>;
  update(id: string, data: Partial<KnowledgeArticle>): Promise<void>;
  delete(id: string): Promise<void>;
}
