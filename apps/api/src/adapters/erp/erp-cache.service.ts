/**
 * S75 — Cache de respostas ERP no Redis. Port de src/lib/integrations/erpCache.ts.
 * TTLs curtos (60-300s) evitam consultas repetidas ao ERP durante uma conversa.
 */
import redis from '../../infrastructure/cache/redis.client';

type ERPQueryType = 'connection' | 'financial' | 'customer';

const TTL: Record<ERPQueryType, number> = {
  connection: 60,
  financial: 120,
  customer: 300,
};

export interface ErpCachePorts {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode: string, ttl: number) => Promise<unknown>;
}

const defaultPorts: ErpCachePorts = {
  get: (k) => redis.get(k),
  set: (k, v, mode, ttl) => redis.set(k, v, mode, ttl),
};

export async function getCachedOrFetch<T>(
  tenantId: string,
  type: ERPQueryType,
  key: string,
  fetchFn: () => Promise<T>,
  ports: ErpCachePorts = defaultPorts,
): Promise<T> {
  const cacheKey = `erp:${tenantId}:${type}:${key}`;

  try {
    const cached = await ports.get(cacheKey);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    // Redis down — continua sem cache
  }

  const fresh = await fetchFn();

  try {
    await ports.set(cacheKey, JSON.stringify(fresh), 'EX', TTL[type] ?? 60);
  } catch {
    // Redis down — ignora
  }

  return fresh;
}
