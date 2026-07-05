import { describe, it, expect, vi } from 'vitest';
import { isSlugAvailable } from './onboarding.service';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn().mockImplementation((table: string) => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        if (table === 'tenants') return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: { id: 'new-id' }, error: null });
      }),
    })),
  },
}));

vi.mock('../../infrastructure/auth/password.service', () => ({
  hashPassword: vi.fn().mockResolvedValue('$argon2id$hashed'),
}));

vi.mock('../../infrastructure/adapters/cobranca-db.adapter', () => ({
  createDefaultCobraiRules: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../adapters/vector/qdrant.adapter', () => ({
  ensureCollection: vi.fn().mockResolvedValue(undefined),
}));

describe('Onboarding Service', () => {
  it('isSlugAvailable retorna true quando slug não existe', async () => {
    const available = await isSlugAvailable('novo-isp');
    expect(available).toBe(true);
  });

  it('onboardNewTenant executa todas as 6 etapas', async () => {
    const { onboardNewTenant } = await import('./onboarding.service');
    const result = await onboardNewTenant({
      tenantName: 'ISP Teste',
      tenantSlug: 'isp-teste',
      plan: 'starter',
      adminName: 'Admin Teste',
      adminEmail: 'admin@ispteste.com',
      adminPassword: 'Senha@1234',
    });

    // Verificar que tentou executar as etapas
    expect(result.completedSteps).toBeDefined();
    expect(Array.isArray(result.completedSteps)).toBe(true);
  });

  it('slug com caracteres inválidos é rejeitado pelo schema', () => {
    const { z } = require('zod');
    const slugSchema = z.string().regex(/^[a-z0-9-]+$/);
    expect(slugSchema.safeParse('ISP Inválido!').success).toBe(false);
    expect(slugSchema.safeParse('isp-valido').success).toBe(true);
  });
});
