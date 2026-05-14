import { KnowledgeRepository, KnowledgeArticle } from '../interfaces';

export class KnowledgeRepositorySupabase implements KnowledgeRepository {
  async search(queryStr: string, tenantId: string): Promise<KnowledgeArticle[]> {
    // TODO: implementar com Supabase (ex: match_documents rpc)
    throw new Error('Supabase not implemented yet');
  }

  async findAll(tenantId: string): Promise<KnowledgeArticle[]> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async create(data: Partial<KnowledgeArticle>): Promise<KnowledgeArticle> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async update(id: string, data: Partial<KnowledgeArticle>): Promise<void> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }

  async delete(id: string): Promise<void> {
    // TODO: implementar com Supabase
    throw new Error('Supabase not implemented yet');
  }
}
