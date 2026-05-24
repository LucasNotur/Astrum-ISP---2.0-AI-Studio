export const redisClient = {
  get: async (key: string): Promise<string | null> => { return null; },
  setex: async (key: string, ttl: number, value: string): Promise<void> => {},
  incr: async (key: string): Promise<number> => { return 1; },
  incrbyfloat: async (key: string, value: number): Promise<number> => { return value; },
  setnx: async (key: string, value: string): Promise<number> => { return 1; },
  del: async (key: string): Promise<number> => { return 1; },
};
