export async function safeFirestoreGet<T>(
  operation: () => Promise<T>,
  fallback: T,
  operationName: string
): Promise<{ data: T; degraded: boolean }> {
  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('FIRESTORE_TIMEOUT')), 5000)
      )
    ]);
    return { data: result, degraded: false };
  } catch (err: any) {
    console.error(`[DEGRADED] ${operationName} failed:`, err.message);
    
    // Only attempt to use Redis on the server-side to prevent 'ioredis' bundling in the browser
    if (typeof window === 'undefined') {
      try {
        const mod = "./redis";
        const redisModule = await import(/* @vite-ignore */ mod);
        const redisInfo = redisModule.default || redisModule.connection || redisModule.redis;
        if (redisInfo && typeof redisInfo.set === 'function') {
          await redisInfo.set('system_degraded', '1', 'EX', 60);
        }
      } catch (e) {
        // Ignore redis load error
      }
    }
    
    return { data: fallback, degraded: true };
  }
}
