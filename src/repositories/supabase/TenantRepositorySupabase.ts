import { TenantRepository, Tenant } from '../interfaces';

export class TenantRepositorySupabase implements TenantRepository {
  async findById(id: string): Promise<Tenant | null> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }
}
