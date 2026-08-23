import * as RedisModule from 'ioredis';
import { infraLogger } from '../logging/logger';

const Redis = (RedisModule as any).default || (RedisModule as any).Redis || RedisModule;

// Só mockamos quando REDIS_URL está genuinamente ausente/inválida. Um REDIS_URL
// apontando para localhost (dev local com Docker) é uma intenção explícita de usar
// Redis de verdade — tratá-lo como mock quebrava o BullMQ (ver getQueueConnection abaixo).
const isMock = !process.env.REDIS_URL || !process.env.REDIS_URL.startsWith('redis');
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

type RetryStrategy = (times: number) => number | null;

// Retry do client de CACHE: desiste após 10 tentativas (~15s) — aceitável, cache
// degrada bem (fallback = miss). NÃO usar essa política pra conexão de fila (ver abaixo).
const CACHE_RETRY_STRATEGY: RetryStrategy = (times) => {
  if (times > 10) {
    infraLogger.error('Redis (cache): máximo de tentativas atingido — desistindo');
    return null;
  }
  const delay = Math.min(times * 100, 3000);
  infraLogger.warn({ attempt: times, delayMs: delay }, 'Redis (cache): reconectando...');
  return delay;
};

// Retry da conexão de FILA: nunca desiste (retorna null = ioredis para de vez).
// Um worker BullMQ que "desiste" de reconectar fica morto até reiniciar o processo —
// bem pior que um cache miss. Backoff exponencial suave, sem teto de tentativas.
const QUEUE_RETRY_STRATEGY: RetryStrategy = (times) => {
  const delay = Math.min(times * 200, 10000);
  infraLogger.warn({ attempt: times, delayMs: delay }, 'Redis (fila): reconectando...');
  return delay;
};

function createRealRedisClient(opts: { commandTimeout?: number; retryStrategy: RetryStrategy }) {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    // 15s, não 5s: investigado ao vivo em 2026-08-23 (ETIMEDOUT no boot). Teste
    // direto de burst (25 conexões TCP simultâneas pro Redis) e de resolução
    // localhost/IPv6 não reproduziram nenhum atraso real (tudo <15ms) — o
    // gargalo não é o Redis nem a rede em si, é latência intermitente de
    // cold-start do Docker Desktop/WSL2 no Windows (a VM precisa "acordar"
    // quando ociosa; o boot do apps/api abre uma rajada de ~20-30 conexões de
    // uma vez, uma por Queue/Worker BullMQ). ioredis já teria retry infinito
    // (QUEUE_RETRY_STRATEGY) ou até 10x (CACHE_RETRY_STRATEGY) mesmo com
    // 5s — só que cada timeout de 5s desperdiçado atrasa a convergência.
    // 15s dá à VM tempo de acordar SEM precisar de um 2º ciclo de retry.
    // Tende a desaparecer de vez quando migrar pra uma VPS Linux (Docker
    // nativo, sem a camada de virtualização WSL2).
    connectTimeout: 15000,
    ...(opts.commandTimeout ? { commandTimeout: opts.commandTimeout } : {}),
    retryStrategy: opts.retryStrategy,
    lazyConnect: false,
  });

  client.on('connect', () => infraLogger.info('Redis: conectado'));
  client.on('ready', () => infraLogger.info('Redis: pronto para comandos'));
  client.on('error', (err: Error) => infraLogger.error({ err }, 'Redis: erro de conexão'));
  client.on('close', () => infraLogger.warn('Redis: conexão fechada'));
  client.on('reconnecting', () => infraLogger.warn('Redis: reconectando...'));

  return client;
}

const createRedisClient = () => {
  if (isMock) {
    return createMockClient();
  }
  // commandTimeout curto é seguro para chamadas de cache (GET/SET pontuais).
  return createRealRedisClient({ commandTimeout: 3000, retryStrategy: CACHE_RETRY_STRATEGY });
};

export const redis = createRedisClient();
export const getRedisClient = () => redis;
export default redis;

/**
 * Conexão dedicada para BullMQ — SEMPRE uma instância própria, nunca compartilhada
 * com `redis`/`getRedisClient()`, por três motivos:
 *
 * 1. Nunca pode ser o mock in-memory: BullMQ distingue uma instância ioredis real
 *    de "opções de conexão" checando `isRedisInstance(opts)` (ver node_modules/bullmq/
 *    dist/cjs/classes/redis-connection.js) — um plain object (o mock) falha nesse
 *    teste e o BullMQ silenciosamente cria seu PRÓPRIO `new IORedis()` com defaults
 *    (127.0.0.1:6379, sem senha, sem a retryStrategy/logging deste módulo), ignorando
 *    o mock por completo. Isso causava ECONNREFUSED bufferizado (Docker fora) ou
 *    NOAUTH (Redis real exigindo senha) de forma totalmente silenciosa.
 * 2. Nunca pode reusar a conexão de cache: BullMQ mantém comandos bloqueantes
 *    (BZPOPMIN etc.) abertos por longos períodos esperando jobs — o
 *    `commandTimeout: 3000` do client de cache (correto para GET/SET pontuais)
 *    derruba esses comandos bloqueantes a cada 3s, quebrando o processamento.
 * 3. Precisa de uma retryStrategy que NUNCA desiste (ver QUEUE_RETRY_STRATEGY) —
 *    diferente do client de cache, que pode dar-se ao luxo de desistir depois de
 *    10 tentativas (o app degrada bem sem cache; um worker morto, não).
 *
 * Toda fila/worker BullMQ deve importar `connection`/`getQueueConnection()` —
 * nunca `redis`/`getRedisClient()`.
 */
let queueConnection: ReturnType<typeof createRealRedisClient> | null = null;
export const getQueueConnection = () => {
  if (!queueConnection) {
    queueConnection = createRealRedisClient({ retryStrategy: QUEUE_RETRY_STRATEGY });
  }
  return queueConnection;
};
export const connection = getQueueConnection();

export async function closeRedis(): Promise<void> {
  if (!isMock && typeof redis.quit === 'function') {
    await (redis as any).quit();
    infraLogger.info('Redis: conexão encerrada graciosamente');
  }
  if (queueConnection && typeof queueConnection.quit === 'function') {
    await queueConnection.quit();
  }
}
