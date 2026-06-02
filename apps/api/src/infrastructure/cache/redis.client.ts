import * as RedisModule from 'ioredis';
import { infraLogger } from '../logging/logger';

const Redis = (RedisModule as any).default || (RedisModule as any).Redis || RedisModule;

const isMock = !process.env.REDIS_URL || process.env.REDIS_URL.includes('localhost') || process.env.REDIS_URL.includes('127.0.0.1') || !process.env.REDIS_URL.startsWith('redis');
const redisUrl = process.env.REDIS_URL && process.env.REDIS_URL.startsWith('redis') ? process.env.REDIS_URL : 'redis://localhost:6379';

export const getRedisStatus = (): 'real' | 'mock' => isMock ? 'mock' : 'real';

function createMockClient() {
  infraLogger.warn("Redis: usando fallback in-memory (sem REDIS_URL real)");
  const store = new Map<string, { value: string, expiresAt: number | null }>();
  return {
    get: async (key: string) => {
      const item = store.get(key);
      if (!item) return null;
      if (item.expiresAt && Date.now() > item.expiresAt) {
        store.delete(key);
        return null;
      }
      return item.value;
    },
    set: async (key: string, value: string, ...args: any[]) => {
      let expiresAt = null;
      let nx = false;
      
      for (let i = 0; i < args.length; i++) {
        if (args[i] === 'EX') expiresAt = Date.now() + args[i + 1] * 1000;
        if (args[i] === 'PX') expiresAt = Date.now() + args[i + 1];
        if (args[i] === 'NX') nx = true;
      }

      if (nx && store.has(key)) {
        const item = store.get(key);
        if (!item?.expiresAt || Date.now() <= item.expiresAt) {
          return null;
        }
      }

      store.set(key, { value, expiresAt });
      return 'OK';
    },
    incr: async (key: string) => {
      const item = store.get(key);
      let val = 1;
      if (item && (!item.expiresAt || Date.now() <= item.expiresAt)) {
        val = parseInt(item.value, 10) + 1;
      }
      store.set(key, { value: val.toString(), expiresAt: item?.expiresAt || null });
      return val;
    },
    incrby: async (key: string, increment: number) => {
      const item = store.get(key);
      let val = Number(increment);
      if (item && (!item.expiresAt || Date.now() <= item.expiresAt)) {
        val = parseInt(item.value, 10) + Number(increment);
      }
      store.set(key, { value: val.toString(), expiresAt: item?.expiresAt || null });
      return val;
    },
    expire: async (key: string, time: number) => {
      const item = store.get(key);
      if (item && (!item.expiresAt || Date.now() <= item.expiresAt)) {
        store.set(key, { value: item.value, expiresAt: Date.now() + time * 1000 });
        return 1;
      }
      return 0;
    },
    append: async (key: string, value: string) => {
      const item = store.get(key);
      let newValue = value;
      if (item && (!item.expiresAt || Date.now() <= item.expiresAt)) {
        newValue = item.value + value;
      }
      store.set(key, { value: newValue, expiresAt: item?.expiresAt || null });
      return newValue.length;
    },
    del: async (key: string) => {
      store.delete(key);
      return 1;
    },
    exists: async (key: string) => {
      const item = store.get(key);
      if (!item) return 0;
      if (item.expiresAt && Date.now() > item.expiresAt) {
        store.delete(key);
        return 0;
      }
      return 1;
    },
    zadd: async (key: string, score: number, member: string) => {
        let setItem = store.get(key);
        if (!setItem || !Array.isArray(setItem.value)) {
            setItem = { value: [] as unknown as string, expiresAt: null };
        }
        const arr = setItem.value as unknown as [number, string][];
        arr.push([score, member]);
        setItem.value = arr as unknown as string;
        store.set(key, setItem);
        return 1;
    },
    zremrangebyscore: async (key: string, min: number, max: number) => {
        const setItem = store.get(key);
        if (!setItem || !Array.isArray(setItem.value)) return 0;
        let arr = setItem.value as unknown as [number, string][];
        const initialLength = arr.length;
        arr = arr.filter(([score]) => score < min || score > max);
        setItem.value = arr as unknown as string;
        store.set(key, setItem);
        return initialLength - arr.length;
    },
    zcard: async (key: string) => {
        const setItem = store.get(key);
        if (!setItem || !Array.isArray(setItem.value)) return 0;
        return (setItem.value as unknown as any[]).length;
    },
    zrangebyscore: async (key: string, min: string, max: string) => {
        const setItem = store.get(key);
        if (!setItem || !Array.isArray(setItem.value)) return [];
        const arr = setItem.value as unknown as [number, string][];
        const minNum = min === '-inf' ? -Infinity : Number(min);
        const maxNum = max === '+inf' ? Infinity : Number(max);
        return arr.filter(([score]) => score >= minNum && score <= maxNum).map(x => x[1]);
    },
    multi: () => redis,
    exec: async () => [],
    quit: async () => {},
  } as any;
}

const createRedisClient = () => {
  if (isMock) {
    return createMockClient();
  }

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 5000,
    commandTimeout: 3000,
    retryStrategy(times: number) {
      if (times > 10) {
        infraLogger.error('Redis: máximo de tentativas atingido — desistindo');
        return null;
      }
      const delay = Math.min(times * 100, 3000);
      infraLogger.warn({ attempt: times, delayMs: delay }, 'Redis: reconectando...');
      return delay;
    },
    lazyConnect: false,
  });

  client.on('connect', () => infraLogger.info('Redis: conectado'));
  client.on('ready', () => infraLogger.info('Redis: pronto para comandos'));
  client.on('error', (err: Error) => infraLogger.error({ err }, 'Redis: erro de conexão'));
  client.on('close', () => infraLogger.warn('Redis: conexão fechada'));
  client.on('reconnecting', () => infraLogger.warn('Redis: reconectando...'));

  return client;
};

export const redis = createRedisClient();
export const connection = redis;
export const getRedisClient = () => redis;
export default redis;

export async function closeRedis(): Promise<void> {
  if (!isMock && typeof redis.quit === 'function') {
    await (redis as any).quit();
    infraLogger.info('Redis: conexão encerrada graciosamente');
  }
}
