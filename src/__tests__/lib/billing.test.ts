import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as billing from '../../lib/billing.ts';
import request from 'supertest';
import express from 'express';

const app = express();
app.use(express.json());
app.post('/webhook/asaas', billing.asaasWebhookHandler);

const { mockCollection, mockGet, mockUpdate, mockAdd, mockWhere, mockQueueAdd } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockUpdate = vi.fn();
  const mockAdd = vi.fn(() => Promise.resolve({ id: 'sub-1' }));
  const mockWhere = vi.fn();
  const mockQueueAdd = vi.fn();

  const mockCollection = vi.fn(() => ({
    doc: vi.fn(() => ({
      get: mockGet,
      update: mockUpdate
    })),
    where: mockWhere,
    add: mockAdd
  }));

  return { mockCollection, mockGet, mockUpdate, mockAdd, mockWhere, mockQueueAdd };
});

vi.mock('../../lib/queue.ts', () => ({
  getTenantQueue: vi.fn(() => ({
    add: mockQueueAdd
  }))
}));

vi.mock('../../lib/firebaseAdmin.ts', () => ({
  adminDb: {
    collection: mockCollection
  }
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP') }
}));

const originalFetch = global.fetch;

describe('Billing Logic & Webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ASAAS_API_KEY = 'mock-asaas-key';
    process.env.ASAAS_WEBHOOK_TOKEN = 'mock-webhook-token';
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('1. createAsaasCustomer -> deve chamar API Asaas e salvar asaas_customer_id no tenant', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'cus_123' })
    });

    const res = await billing.createAsaasCustomer({ name: 'Test', email: 'test@test.com' });
    expect(res.id).toBe('cus_123');
    expect(global.fetch).toHaveBeenCalledWith('https://api.asaas.com/v3/customers', expect.objectContaining({
       method: 'POST',
       headers: expect.objectContaining({ 'access_token': 'mock-asaas-key' })
    }));
  });

  it('2. createSubscription -> deve criar assinatura recorrente e retornar subscription_id', async () => {
    mockGet.mockResolvedValueOnce({
       exists: true,
       data: () => ({ asaas_customer_id: 'cus_123' })
    });
    mockWhere.mockReturnValueOnce({
       get: vi.fn().mockResolvedValueOnce({ docs: [] }) // No active sub
    });
    
    (global.fetch as any).mockResolvedValueOnce({
       ok: true,
       json: async () => ({ id: 'sub_123' })
    });

    const res = await billing.createSubscription('tenant-1', 'pro');
    expect(res.id).toBe('sub_123');
    expect(global.fetch).toHaveBeenCalledWith('https://api.asaas.com/v3/subscriptions', expect.objectContaining({
       method: 'POST'
    }));
    expect(mockAdd).toHaveBeenCalled();
  });

  it('3. Webhook PAYMENT_RECEIVED -> billing_status=paid + reativa tenant suspenso', async () => {
    const res = await request(app)
       .post('/webhook/asaas')
       .set('asaas-access-token', 'mock-webhook-token')
       .send({
          event: 'PAYMENT_RECEIVED',
          payment: { externalReference: 'tenant-1' }
       });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
       billing_status: 'paid', status: 'active'
    });
  });

  it('4. Webhook PAYMENT_OVERDUE -> agenda job lockout_tenant com delay de 3 dias no BullMQ', async () => {
    const res = await request(app)
       .post('/webhook/asaas')
       .set('asaas-access-token', 'mock-webhook-token')
       .send({
          event: 'PAYMENT_OVERDUE',
          payment: { externalReference: 'tenant-1' }
       });
    expect(res.status).toBe(200);
    expect(mockQueueAdd).toHaveBeenCalledWith('lockout_tenant', { tenantId: 'tenant-1' }, { delay: 259200000 });
  });

  it('5. Webhook PAYMENT_DELETED -> cancela subscription no Firestore', async () => {
    mockWhere.mockReturnValueOnce({
       get: vi.fn().mockResolvedValueOnce({
          docs: [
             { id: 'sub-doc-1', data: () => ({ status: 'ACTIVE', asaas_subscription_id: 'sub_123' }) }
          ]
       })
    });
    (global.fetch as any).mockResolvedValueOnce({
       ok: true,
       json: async () => ({ id: 'sub_123', status: 'DELETED' })
    });

    const res = await request(app)
       .post('/webhook/asaas')
       .set('asaas-access-token', 'mock-webhook-token')
       .send({
          event: 'PAYMENT_DELETED',
          payment: { externalReference: 'tenant-1' }
       });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'CANCELLED' });
  });

  it('6. Webhook com header asaas-access-token inválido -> retorna 401 sem processar', async () => {
    const res = await request(app)
       .post('/webhook/asaas')
       .set('asaas-access-token', 'wrong-token')
       .send({
          event: 'PAYMENT_RECEIVED',
          payment: { externalReference: 'tenant-1' }
       });
    expect(res.status).toBe(401);
  });

  it('7. createSubscription com tenant já com subscription ativa -> não duplica', async () => {
    mockGet.mockResolvedValueOnce({
       exists: true,
       data: () => ({ asaas_customer_id: 'cus_123' })
    });
    mockWhere.mockReturnValueOnce({
       get: vi.fn().mockResolvedValueOnce({
          docs: [ { id: 'old-sub', data: () => ({ status: 'ACTIVE' }) } ]
       }) // Active sub exists
    });

    await expect(billing.createSubscription('tenant-1', 'pro')).rejects.toThrow('Tenant already has an active subscription');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
