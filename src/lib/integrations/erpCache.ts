import redis from "../redis";

type ERPQueryType = "connection" | "financial" | "customer";

const getTTLForType = (type: string): number => {
  if (type === "connection") return 60; // 60s
  if (type === "financial") return 120; // 120s
  if (type === "customer") return 300; // 300s
  return 60; // default 60s
};

export const getCachedOrFetch = async <T>(
  tenantId: string,
  type: string,
  customerId: string,
  fetchFn: () => Promise<T>
): Promise<T> => {
  const cacheKey = `erp:${tenantId}:${type}:${customerId}`;

  try {
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData) as T;
    }
  } catch (error) {
    console.error(`Erro ao ler cache do Redis para chave ${cacheKey}`, error);
    // Em caso de erro no Redis, prossegue para buscar os dados via get
  }

  // Se não estiver no cache ou se houve erro ao ler o cache, faz o fetch
  const freshData = await fetchFn();

  try {
    const ttl = getTTLForType(type);
    await redis.set(cacheKey, JSON.stringify(freshData), "EX", ttl);
  } catch (error) {
    console.error(`Erro ao gravar cache no Redis para chave ${cacheKey}`, error);
  }

  return freshData;
};
