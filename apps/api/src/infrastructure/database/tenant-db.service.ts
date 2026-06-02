import { supabaseAdmin } from './supabase.client';
import { infraLogger } from '../logging/logger';

/**
 * Helper para operações de banco que precisam do contexto de tenant.
 * Usa supabaseAdmin mas adiciona filtro de tenant_id automaticamente
 * para operações do servidor (que não passam pelo RLS do auth).
 *
 * IMPORTANTE: O RLS protege o banco via Supabase client do frontend.
 * No backend (service role), o filtro de tenant_id é responsabilidade do código.
 */
export function tenantQuery(tenantId: string) {
  return {
    /**
     * Busca registros garantindo que pertencem ao tenant correto.
     */
    from: (table: string) => ({
      select: (columns = '*') =>
        supabaseAdmin
          .from(table)
          .select(columns)
          .eq('tenant_id', tenantId),

      insert: (data: Record<string, unknown> | Record<string, unknown>[]) => {
        const records = Array.isArray(data) ? data : [data];
        const withTenant = records.map(r => ({ ...r, tenant_id: tenantId }));
        return supabaseAdmin.from(table).insert(withTenant);
      },

      update: (data: Record<string, unknown>) =>
        supabaseAdmin
          .from(table)
          .update(data)
          .eq('tenant_id', tenantId),

      delete: () =>
        supabaseAdmin
          .from(table)
          .delete()
          .eq('tenant_id', tenantId),
    }),
  };
}
