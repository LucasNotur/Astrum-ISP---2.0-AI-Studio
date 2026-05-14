import { CustomerRepository, Customer } from '../interfaces';

export class CustomerRepositorySupabase implements CustomerRepository {
  async findById(id: string, tenantId: string): Promise<Customer | null> {
    // TODO: implementar com Supabase
    // SELECT * FROM customers WHERE id = $1 AND tenant_id = $2
    throw new Error('Supabase not implemented yet');
  }

  async findByPhone(phone: string, tenantId: string): Promise<Customer | null> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async findByCpf(cpf: string, tenantId: string): Promise<Customer | null> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async create(data: Partial<Customer>): Promise<Customer> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async update(id: string, data: Partial<Customer>): Promise<void> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async delete(id: string): Promise<void> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }
}
