import { vi, beforeEach } from 'vitest';
import WebSocket from 'ws';

// Mock global fetch
global.fetch = vi.fn();

// Polyfill para WebSocket (Supabase exige no Node)
if (typeof global.WebSocket === 'undefined') {
  (global as any).WebSocket = WebSocket;
}

// Mock Redis using ioredis-mock
vi.mock('ioredis', async () => {
    const RedisMock = (await import('ioredis-mock')).default;
    return { default: RedisMock, Redis: RedisMock };
});

// Mock Firebase Admin SDK
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
  cert: vi.fn()
}));

vi.mock('firebase-admin/firestore', () => {
  const dbMock = {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
    add: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    batch: vi.fn().mockReturnValue({
       update: vi.fn(),
       set: vi.fn(),
       delete: vi.fn(),
       commit: vi.fn().mockResolvedValue(true)
    })
  };

  return {
    getFirestore: vi.fn(() => ({
      ...dbMock,
      runTransaction: vi.fn(async (cb: any) => {
        return cb({
          get: vi.fn(async (q) => ({ empty: true, forEach: () => {} })),
          update: vi.fn(),
          set: vi.fn(),
          delete: vi.fn()
        });
      })
    })),
    Timestamp: { now: vi.fn(() => ({ toMillis: () => Date.now() })), fromDate: vi.fn((d) => ({ toMillis: () => d.getTime() })) },
    FieldValue: {
      serverTimestamp: vi.fn(() => 'mock-timestamp'),
      delete: vi.fn(() => 'mock-delete')
    }
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});
