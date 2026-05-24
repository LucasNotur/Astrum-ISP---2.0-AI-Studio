import { redisClient } from '../redis';

export const TTL = {
  CONNECTION_STATUS: 60,
  INVOICES: 120,
  CUSTOMER_DATA: 300,
};

export async function withCache<T>(
  key: string,
  ttl: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  const cached = await redisClient.get(key);
  if (cached) {
    return JSON.parse(cached);
  }
  
  const data = await fetchFn();
  await redisClient.setex(key, ttl, JSON.stringify(data));
  return data;
}

export function cleanNullUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== null && v !== undefined)
  ) as Partial<T>;
}
