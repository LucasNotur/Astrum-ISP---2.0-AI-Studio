import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import superAdminRouter from '../../routes/superAdmin.ts';

// Mock dependencies
const mockVerifyIdToken = vi.fn();

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockDoc = vi.fn(() => ({
  get: mockGet,
  set: mockSet,
  update: mockUpdate,
}));
const mockLimit = vi.fn(() => ({ get: mockGet }));
const mockOrderBy = vi.fn(() => ({ limit: mockLimit, get: mockGet }));
const mockWhere = vi.fn(() => ({
  limit: mockLimit,
  orderBy: mockOrderBy,
  get: mockGet,
}));

const mockCollection = vi.fn(() => ({
  get: mockGet,
  doc: mockDoc,
  where: mockWhere,
  orderBy: mockOrderBy,
}));

vi.mock('../../lib/firebaseAdmin.ts', () => {
  return {
    adminDb: {
      collection: (...args: [any]) => mockCollection(...args),
    },
  };
});

// FZ-3: a rota verifica JWT Supabase via lib/authVerify
vi.mock('../../lib/authVerify.ts', () => ({
  verifySupabaseToken: (...args: [any]) => mockVerifyIdToken(...args),
}));

vi.mock('../../lib/saasMetrics', () => {
  return {
    calculateMRR: vi.fn().mockImplementation(async (date: Date) => {
      // return 1000 for current month, 800 for previous month
      if (date.getMonth() === new Date().getMonth()) return 1000;
      return 800;
    }),
    calculateChurnRate: vi.fn().mockResolvedValue(5),
  };
});

const app = express();
app.use(express.json());
app.use('/api/super-admin', superAdminRouter);

describe('Super Admin Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. GET /api/super-admin/tenants sem token -> 401', async () => {
    const res = await request(app).get('/api/super-admin/tenants');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('2. GET /api/super-admin/tenants com token de tenant normal -> 403', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'user-123',
      tenantId: 'tenant-123',
      role: 'admin',
    });

    const res = await request(app)
      .get('/api/super-admin/tenants')
      .set('Authorization', 'Bearer NORMAL_TOKEN');
      
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden: SuperAdmin only' });
  });

  it('3. GET /api/super-admin/tenants com claim isSuperAdmin=true -> retorna lista de tenants com status', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'super-admin-user',
      role: 'super_admin',
    });

    mockGet.mockResolvedValueOnce({
      docs: [
        { id: 't1', data: () => ({ name: 'Tenant 1', status: 'active' }) },
        { id: 't2', data: () => ({ name: 'Tenant 2', status: 'suspended' }) },
      ],
      size: 2,
    });

    const res = await request(app)
      .get('/api/super-admin/tenants')
      .set('Authorization', 'Bearer SUPER_TOKEN');
      
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 't1', name: 'Tenant 1', status: 'active' },
      { id: 't2', name: 'Tenant 2', status: 'suspended' },
    ]);
  });

  it('4. POST /api/super-admin/tenants/:id/suspend -> atualiza status=suspended no Firestore', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ role: 'super_admin' });
    
    mockGet.mockResolvedValueOnce({ exists: true });
    mockUpdate.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/super-admin/tenants/t1/suspend')
      .set('Authorization', 'Bearer SUPER_TOKEN');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockCollection).toHaveBeenCalledWith('tenants');
    expect(mockDoc).toHaveBeenCalledWith('t1');
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'suspended' });
  });

  it('5. POST /api/super-admin/tenants/:id/reactivate -> atualiza status=active', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ role: 'super_admin' });
    
    mockGet.mockResolvedValueOnce({ exists: true });
    mockUpdate.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/super-admin/tenants/t1/reactivate')
      .set('Authorization', 'Bearer SUPER_TOKEN');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockCollection).toHaveBeenCalledWith('tenants');
    expect(mockDoc).toHaveBeenCalledWith('t1');
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'active' });
  });

  it('6. GET /api/super-admin/metrics -> retorna MRR, churn e tenants ativos', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ role: 'super_admin' });

    // mock saas_metrics get
    mockGet.mockResolvedValueOnce({
      docs: [
        { id: '2023-10', data: () => ({ mrr: 800 }) },
      ],
      forEach: function(cb: any) { this.docs.forEach(cb) }
    });

    // mock tenants get
    mockGet.mockResolvedValueOnce({
      docs: [
        { id: 't1', data: () => ({ status: 'active', plan: 'pro', companyName: 'Company 1' }) },
        { id: 't2', data: () => ({ status: 'cancelled', plan: 'free' }) },
      ],
      size: 2,
      forEach: function(cb: any) { this.docs.forEach(cb) }
    });

    const res = await request(app)
      .get('/api/super-admin/metrics')
      .set('Authorization', 'Bearer SUPER_TOKEN');

    expect(res.status).toBe(200);
    expect(res.body.total_mrr).toBe(1000);
    expect(res.body.mrr_variation).toBe(25); // ((1000-800)/800)*100
    expect(res.body.current_churn_rate).toBe(5);
    expect(res.body.active_tenants).toBe(1);
    expect(res.body.churned_tenants).toBe(1);
    expect(res.body.total_tenants).toBe(2);
    expect(res.body.top_tenants[0].name).toBe('Company 1');
  });

  it('7. Tenant inexistente em qualquer operaÃ§Ã£o -> 404', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ role: 'super_admin' });
    
    mockGet.mockResolvedValueOnce({ exists: false });

    const res = await request(app)
      .post('/api/super-admin/tenants/invalid-id/suspend')
      .set('Authorization', 'Bearer SUPER_TOKEN');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Tenant not found');
  });
});
