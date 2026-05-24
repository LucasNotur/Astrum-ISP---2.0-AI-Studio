import { vi, beforeEach } from 'vitest';

// Mock global fetch
global.fetch = vi.fn();

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
    getFirestore: vi.fn(() => dbMock),
    FieldValue: {
      serverTimestamp: vi.fn(() => 'mock-timestamp'),
      delete: vi.fn(() => 'mock-delete')
    }
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});
