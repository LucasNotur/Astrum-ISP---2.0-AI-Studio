import { vi, beforeEach } from 'vitest';

// Mock global fetch
global.fetch = vi.fn();

// Mock Redis using ioredis-mock
vi.mock('ioredis', async () => {
    const RedisMock = (await import('ioredis-mock')).default;
    return { default: RedisMock, Redis: RedisMock };
});

// FZ-5: mock do client Supabase server-side (substitui os mocks do firebase-admin).
// Chain genérico: qualquer método devolve o próprio chain; awaits resolvem vazio.
vi.mock('../lib/supabaseAdmin', () => {
  function makeChain(): any {
    const chain: any = {};
    const methods = [
      'select', 'eq', 'neq', 'is', 'not', 'gt', 'gte', 'lt', 'lte', 'in',
      'contains', 'order', 'limit', 'range', 'update', 'insert', 'upsert', 'delete',
    ];
    for (const m of methods) chain[m] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    chain.single = vi.fn(async () => ({ data: null, error: null }));
    chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
    return chain;
  }
  return {
    supabaseAdmin: {
      from: vi.fn(() => makeChain()),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(async () => ({ data: { path: 'mock' }, error: null })),
          remove: vi.fn(async () => ({ data: null, error: null })),
          list: vi.fn(async () => ({ data: [], error: null })),
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://mock.supabase.co/mock' } })),
          createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://mock.signed' }, error: null })),
        })),
      },
      auth: {
        getSession: vi.fn(async () => ({ data: { session: null } })),
      },
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});
