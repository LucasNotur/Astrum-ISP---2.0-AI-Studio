import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('svix', () => ({
  Webhook: class MockWebhook {},
  WebhookRequiredHeaders: {},
  Svix: class MockSvix {
    message = { create: vi.fn(async () => ({ id: 'msg_1' })) };
    application = { create: vi.fn(async () => ({ id: 'app_1' })) };
    authentication = { appPortalAccess: vi.fn(async () => ({ url: 'https://portal.svix.com/x' })) };
    endpoint = {
      create: vi.fn(async () => ({ id: 'ep_1' })),
      delete: vi.fn(async () => undefined),
      list: vi.fn(async () => ({ data: [{ id: 'ep_1' }] })),
    };
    messageAttempt = { resend: vi.fn(async () => undefined) };
  },
}));

let tenantSvixAppId: string | null = null;

const supabaseFrom = vi.fn((table: string) => {
  if (table === 'tenants') {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: tenantSvixAppId ? { svix_app_id: tenantSvixAppId } : null })),
      update: vi.fn().mockReturnThis(),
    };
  }
  if (table === 'webhook_deliveries') {
    return {
      insert: vi.fn(async () => ({ error: null })),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: { id: 'delivery-1', tenant_id: 'tenant-1', svix_message_id: 'msg_1' },
        error: null,
      })),
    };
  }
  throw new Error(`tabela inesperada no mock: ${table}`);
});

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: supabaseFrom },
}));

describe('SvixService — regressão S1 (client anônimo tinha zero grants, usava silenciosamente supabase.from)', () => {
  beforeEach(() => {
    tenantSvixAppId = null;
    vi.clearAllMocks();
  });

  it('send() grava o audit log de webhook_deliveries via supabaseAdmin', async () => {
    const { SvixService } = await import('./svix.service');
    const service = new SvixService();

    await service.send('tenant-1', 'invoice.paid', { invoiceId: 'inv-1' });

    expect(supabaseFrom).toHaveBeenCalledWith('webhook_deliveries');
    expect(supabaseFrom).toHaveBeenCalledWith('tenants');
  });

  it('_getOrCreateApp persiste o app_id novo em tenants via supabaseAdmin', async () => {
    const { SvixService } = await import('./svix.service');
    const service = new SvixService();

    const appId = await (service as any)._getOrCreateApp('tenant-1');

    expect(appId).toBe('app_1');
    const tenantsCall = supabaseFrom.mock.results.find((_, i) => supabaseFrom.mock.calls[i][0] === 'tenants');
    expect(tenantsCall).toBeDefined();
  });

  it('resendDelivery() lê a entrega escopada por tenant via supabaseAdmin e reenvia', async () => {
    const { SvixService } = await import('./svix.service');
    const service = new SvixService();

    const result = await service.resendDelivery('tenant-1', 'delivery-1');

    expect(supabaseFrom).toHaveBeenCalledWith('webhook_deliveries');
    expect(result.resent).toBe(1);
  });
});
