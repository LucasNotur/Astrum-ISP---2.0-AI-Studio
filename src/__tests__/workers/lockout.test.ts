import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { tenantStatusMiddleware } from '../../middleware/tenantStatusMiddleware.ts';

const mockGet = vi.fn();

vi.mock('../../lib/firebaseAdmin.ts', () => {
  return {
    adminDb: {
      collection: () => ({ doc: () => ({ get: mockGet }) })
    },
    default: {
      firestore: {
        FieldValue: {
          serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP')
        }
      }
    }
  };
});

// Mock Redis
vi.mock('../../lib/redis.ts', () => {
  return {
    connection: {},
    default: {
      get: vi.fn(),
      set: vi.fn(),
      options: {}
    }
  };
});

describe('tenantStatusMiddleware Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const app = express();
  app.use(express.json());
  app.use(tenantStatusMiddleware);
  app.get('/api/protected', (req, res) => res.status(200).json({ ok: true }));
  app.post('/api/webhook/evolution', (req, res) => res.status(200).json({ ok: true }));
  app.get('/api/health', (req, res) => res.status(200).json({ ok: true }));

  it('Tenant suspenso -> middleware retorna 402 em rotas protegidas', async () => {
    // redis.get mock default returns undefined
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ status: 'suspended', suspended_reason: 'billing_overdue' })
    });

    const res = await request(app).get('/api/protected?tenantId=tenant-1');
    expect(res.status).toBe(402);
    expect(res.body.error).toBe('TENANT_SUSPENDED');
  });

  it('Rota /api/webhook/evolution com tenant suspenso -> continua funcionando', async () => {
    // It shouldn't even call db.get because it skips webhook routes
    const res = await request(app).post('/api/webhook/evolution?tenantId=tenant-1');
    expect(res.status).toBe(200);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('Rota /api/health -> sempre retorna 200 independente do status do tenant', async () => {
    // It skips health routes
    const res = await request(app).get('/api/health?tenantId=tenant-1');
    expect(res.status).toBe(200);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
