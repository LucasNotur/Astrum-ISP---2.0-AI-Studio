import { ServiceOrderRepository, ServiceOrder } from '../interfaces';

export class ServiceOrderRepositorySupabase implements ServiceOrderRepository {
  async findById(id: string): Promise<ServiceOrder | null> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async findOpenByCustomer(customerId: string, tenantId: string): Promise<ServiceOrder[]> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async findByDateRange(tenantId: string, start: Date, end: Date): Promise<ServiceOrder[]> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async create(data: Partial<ServiceOrder>): Promise<ServiceOrder> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async update(id: string, data: Partial<ServiceOrder>): Promise<void> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }
}
