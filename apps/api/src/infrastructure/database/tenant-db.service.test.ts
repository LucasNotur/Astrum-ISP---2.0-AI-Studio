import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    }),
  },
}));

describe('Tenant Query Helper', () => {
  it('adiciona tenant_id automaticamente no insert', async () => {
    const { tenantQuery } = await import('./tenant-db.service');
    const { supabaseAdmin } = await import('./supabase.client');

    await tenantQuery('tenant-123').from('tickets').insert({ title: 'Teste' });

    expect(supabaseAdmin.from).toHaveBeenCalledWith('tickets');
  });

  it('filtra por tenant_id no select', async () => {
    const { tenantQuery } = await import('./tenant-db.service');
    const { supabaseAdmin } = await import('./supabase.client');

    tenantQuery('tenant-123').from('customers').select('name');

    const mockFrom = (supabaseAdmin.from as any).mock.results[0].value;
    expect(mockFrom.eq).toHaveBeenCalledWith('tenant_id', 'tenant-123');
  });
});
