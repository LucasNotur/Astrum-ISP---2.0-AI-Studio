import type { AstrumDecodedToken } from '../middleware/auth.types'

interface CacheEntry {
  token: AstrumDecodedToken
  cachedAt: number
}

// Cache simples em Map com TTL e limite de tamanho
// Não usar Redis aqui — esse cache é local ao processo, proposital
const CACHE_TTL_MS = 5 * 60 * 1000   // 5 minutos
const MAX_ENTRIES  = 2_000            // ~2k usuários simultâneos por instância

const cache = new Map<string, CacheEntry>()

// Evicção simples: limpa metade do cache quando atinge o limite
function evict(): void {
  if (cache.size < MAX_ENTRIES) return
  const half = Math.floor(MAX_ENTRIES / 2)
  let count = 0
  for (const key of cache.keys()) {
    cache.delete(key)
    if (++count >= half) break
  }
}

export function getCachedToken(rawToken: string): AstrumDecodedToken | null {
  const entry = cache.get(rawToken)
  if (!entry) return null
  // Expirou — remove e retorna null
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(rawToken)
    return null
  }
  return entry.token
}

export function setCachedToken(rawToken: string, decoded: AstrumDecodedToken): void {
  evict()
  cache.set(rawToken, { token: decoded, cachedAt: Date.now() })
}

export function invalidateCachedToken(rawToken: string): void {
  cache.delete(rawToken)
}

// Estatísticas — útil para monitorar hit rate no Sentry/Helicone
export function cacheStats(): { size: number; maxSize: number } {
  return { size: cache.size, maxSize: MAX_ENTRIES }
}
