import redis from '../cache/redis.client';
import { infraLogger } from '../logging/logger';

// INFRA-02 (auditoria 2026-08-10): `failClosed` = quando o Redis falha, BLOQUEAR em vez
// de deixar passar. Ligado nos grupos onde "passar livre" custa dinheiro (`ai` = fatura de
// LLM, `billing` = cobrança) → evita DoS financeiro numa queda/derrubada do Redis.
// `webhooks`/`default` seguem fail-open (disponibilidade: não perder webhooks/tráfego geral).
export const RATE_LIMIT_CONFIGS = {
  ai: { capacity: 10, refillRate: 10 / 60, tokensPerRequest: 1, failClosed: true },
  billing: { capacity: 5, refillRate: 5 / 60, tokensPerRequest: 1, failClosed: true },
  webhooks: { capacity: 100, refillRate: 100 / 60, tokensPerRequest: 1, failClosed: false },
  default: { capacity: 60, refillRate: 1, tokensPerRequest: 1, failClosed: false },
} as const;

export type RouteGroup = keyof typeof RATE_LIMIT_CONFIGS;

export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
  resetInSeconds: number;
  limit: number;
}

export async function checkRateLimit(tenantId: string, routeGroup: string): Promise<RateLimitResult> {
  const groupName = Object.keys(RATE_LIMIT_CONFIGS).includes(routeGroup) ? routeGroup as RouteGroup : 'default';
  const config = RATE_LIMIT_CONFIGS[groupName];
  const { capacity, refillRate, tokensPerRequest } = config;

  const cacheKey = `rate_limit:token_bucket:${groupName}:${tenantId}`;

  try {
    const rawData = await redis.get(cacheKey);
    const now = Date.now();

    let tokens: number = capacity;
    let lastRefill = now;

    if (rawData) {
      const data = JSON.parse(rawData);
      tokens = data.tokens;
      lastRefill = data.lastRefill;

      const elapsedSeconds = (now - lastRefill) / 1000;
      const tokensToAdd = elapsedSeconds * refillRate;
      
      tokens = Math.min(capacity, tokens + tokensToAdd);
    }

    if (tokens < tokensPerRequest) {
      const tokensShortfall = tokensPerRequest - tokens;
      const resetInSeconds = Math.ceil(tokensShortfall / refillRate);
      return {
        allowed: false,
        remainingTokens: Math.floor(tokens),
        resetInSeconds,
        limit: capacity,
      };
    }

    tokens -= tokensPerRequest;

    await redis.set(cacheKey, JSON.stringify({ tokens, lastRefill: now }), 'EX', 3600);

    return {
      allowed: true,
      remainingTokens: Math.floor(tokens),
      resetInSeconds: 0,
      limit: capacity,
    };
  } catch (error: any) {
    // INFRA-02: grupos críticos (ai/billing) falham FECHADO — Redis fora não pode virar
    // barra-livre de custo. Grupos não-críticos seguem fail-open (disponibilidade).
    const failClosed = (config as { failClosed?: boolean }).failClosed === true;
    infraLogger.error(
      { err: error, routeGroup: groupName, failClosed },
      failClosed
        ? 'Redis fora no rate limit — BLOQUEANDO grupo crítico (fail-closed)'
        : 'Redis fora no rate limit — deixando passar (fail-open)',
    );
    return {
      allowed: !failClosed,
      remainingTokens: 0,
      resetInSeconds: failClosed ? 60 : 0,
      limit: capacity,
    };
  }
}

export function getRouteGroup(url: string): RouteGroup {
  const path = url.split('?')[0] || '';
  if (path.includes('/api/ai') || path.includes('/api/chat')) return 'ai';
  if (path.includes('/api/billing') || path.includes('/api/payments')) return 'billing';
  if (path.includes('/api/webhook')) return 'webhooks';
  return 'default';
}
