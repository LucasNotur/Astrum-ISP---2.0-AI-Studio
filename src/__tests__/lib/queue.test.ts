import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { dlqRouter } from '../../routes/dlq.ts';

const { mockAdd, mockUpdate, mockGet, mockWhere, mockDocRef, mockCollection, mockGetAggregateJobCounts, mockCobraiQueue, mockTenantQueueAdd, mockGetTenantQueue } = vi.hoisted(() => {
  const mockAdd = vi.fn();
  const mockUpdate = vi.fn();
  const mockGet = vi.fn().mockResolvedValue({ docs: [], size: 0, empty: true });
  const mockWhere = vi.fn(() => ({ where: mockWhere, get: mockGet }));
  
  // Create an intelligent docRef mock
  const mockDocRef = vi.fn((docId) => ({ 
      get: vi.fn(async () => {
         // Default tenant response
         if (docId === 't-1' || docId === 'tenant-b') {
             return { exists: true, data: () => ({ plan: 'PRO' }) };
         }
         // Otherwise, defer to our generic mockGet
         return mockGet();
      }),
      update: mockUpdate 
  }));

  const mockCollection = vi.fn((colName) => ({
    add: mockAdd,
    where: mockWhere,
    doc: mockDocRef
  }));

  const mockGetAggregateJobCounts = vi.fn();
  const mockCobraiQueue = {
    getJobCounts: vi.fn()
  };

  const mockTenantQueueAdd = vi.fn();
  const mockGetTenantQueue = vi.fn(() => ({
    add: mockTenantQueueAdd
  }));

  return { mockAdd, mockUpdate, mockGet, mockWhere, mockDocRef, mockCollection, mockGetAggregateJobCounts, mockCobraiQueue, mockTenantQueueAdd, mockGetTenantQueue };
});

vi.mock('../../lib/firebaseAdmin.ts', () => ({
  adminDb: {
    collection: mockCollection
  },
  default: {
    firestore: {
      FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP')
      }
    }
  }
}));

vi.mock('../../../src/lib/queue.ts', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getTenantQueue: mockGetTenantQueue
  };
});
vi.mock('../../../src/lib/queue', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getAggregateJobCounts: mockGetAggregateJobCounts,
    cobraiQueue: mockCobraiQueue
  };
});
vi.mock('../../lib/queue.ts', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getAggregateJobCounts: mockGetAggregateJobCounts,
    cobraiQueue: mockCobraiQueue,
    getTenantQueue: mockGetTenantQueue
  };
});

vi.mock('../../lib/featureFlags.ts', () => ({
  getTenantPlanId: vi.fn(() => 'PRO'),
  checkFeatureAccess: vi.fn(() => true),
  checkLimit: vi.fn(() => 9999)
}));

vi.mock('../../workers/cobraiWorker.ts', () => ({
  cobraiQueue: { add: vi.fn() }
}));

let intervalCallbacks: Function[] = [];
const originalSetInterval = global.setInterval;
global.setInterval = function(this: any, cb: Function, ms?: number) {
  if (ms === 30 * 60 * 1000) intervalCallbacks.push(cb);
  return originalSetInterval.apply(this, arguments as any);
} as any;

describe.skip('DLQ Tests', () => {
  let app: any;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/dlq', dlqRouter);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    global.setInterval = originalSetInterval;
  });

  it('1. Job que falha 3 vezes -> salvo no Firestore dead_letter_queue com retry_count=3 e resolved=false', async () => {
    const { setupDLQ } = await import('../../lib/queue.ts');
    const mockWorker = { on: vi.fn() };
    setupDLQ(mockWorker);
    
    expect(mockWorker.on).toHaveBeenCalledWith('failed', expect.any(Function));
    
    const handler = mockWorker.on.mock.calls.find((c: any) => c[0] === 'failed')![1];
    
    const job = {
      id: 'mock-1',
      name: 'some-job',
      attemptsMade: 3,
      opts: { attempts: 3 },
      data: { tenantId: 't-1', message: 'hello' }
    };
    const error = new Error('Failed hard');
    
    await handler(job, error);
    
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({
      job_id: 'mock-1',
      type: 'some-job',
      retry_count: 3,
      resolved: false,
      tenant_id: 't-1'
    }));
  });

  it('2. GET /api/dlq?tenantId= -> lista jobs com resolved=false do tenant correto', async () => {
    mockGet.mockResolvedValue({
      docs: [
        { id: 'dlq-1', data: () => ({ type: 'test', resolved: false }) }
      ]
    });
    
    const res = await request(app).get('/api/dlq?tenantId=t-1');
    if(res.status !== 200) console.log(res.body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'dlq-1', type: 'test', resolved: false }]);
  });

  it('3. POST /api/dlq/:jobId/retry -> remove da DLQ e recoloca na fila BullMQ', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ tenant_id: 't-1', type: 'test', payload: { a: 1 }, resolved: false })
    });
    
    const res = await request(app).post('/api/dlq/dlq-1/retry?tenantId=t-1');
    if(res.status !== 200) console.log(res.body);
    expect(res.status).toBe(200);
    expect(mockTenantQueueAdd).toHaveBeenCalledWith('test', { a: 1 });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ resolved: true }));
  });

  it('6. DLQ do tenant A -> NÃO aparece na listagem do tenant B (mocks isolados por tenantId)', async () => {
    mockGet.mockResolvedValueOnce({ docs: [] });
    await request(app).get('/api/dlq?tenantId=tenant-b');
    
    expect(mockWhere).toHaveBeenCalledWith('tenant_id', '==', 'tenant-b');
  });

  it('4. Cron de retry automático -> jobs com retry_count < 5 e failed_at > 10min são retentados', async () => {
    expect(intervalCallbacks.length).toBeGreaterThan(0);
    
    mockGet.mockResolvedValueOnce({
      empty: false,
      size: 1,
      docs: [
        {
          ref: { update: mockUpdate },
          data: () => ({ tenant_id: 't-cron', type: 'cron_job', payload: { b: 2 } })
        }
      ]
    });
    
    const cronCallback = intervalCallbacks[0];
    await cronCallback();
    
    expect(mockWhere).toHaveBeenCalledWith('retry_count', '<', 5);
    expect(mockTenantQueueAdd).toHaveBeenCalledWith('cron_job', { b: 2 });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ resolved: true }));
  });

  it('5. Job com retry_count >= 5 -> NÃO é retentado automaticamente pelo cron (mockWhere usa < 5)', async () => {
     mockGet.mockResolvedValueOnce({ empty: true });
     
     // just invoke to verify it builds the correct query
     const cronCallback = intervalCallbacks[0];
     await cronCallback();
     
     expect(mockWhere).toHaveBeenCalledWith('retry_count', '<', 5);
  });
});
