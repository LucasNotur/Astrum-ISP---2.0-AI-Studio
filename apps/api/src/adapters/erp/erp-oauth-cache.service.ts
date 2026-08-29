/**
 * Cache compartilhado (Redis) de access_token OAuth por tenant+provider.
 *
 * Achado de auditoria 2026-08-28 (Voalle) — confirmado que vale também para o
 * Hubsoft: `erp.factory.ts` cria uma instância nova de adapter a cada chamada
 * (`ToolsExecutor._getErpAdapter`, `check_invoice`, `sales-funnel.service.ts`),
 * então o cache em memória dentro do adapter (`this.accessToken`) só sobrevive
 * durante o tempo de vida daquela instância — na prática, uma chamada só. Sem
 * um cache persistente por tenant, o modo OAuth reautentica do zero em quase
 * toda operação, multiplicando chamadas desnecessárias ao ERP e arriscando
 * rate-limit. Mesmo formato do padrão de erp-cache.service.ts (ports
 * injetáveis, degrada bem se o Redis estiver fora).
 */
import redis from '../../infrastructure/cache/redis.client';
import type { ERPProviderName } from './erp.types';

export interface OAuthTokenCache {
  get(): Promise<string | null>;
  set(token: string, ttlSec: number): Promise<void>;
}

export interface OAuthTokenCachePorts {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode: string, ttl: number) => Promise<unknown>;
}

const defaultPorts: OAuthTokenCachePorts = {
  get: (k) => redis.get(k),
  set: (k, v, mode, ttl) => redis.set(k, v, mode, ttl),
};

/** Cria um OAuthTokenCache com escopo tenant+provider, para injetar num adapter ERP. */
export function createOAuthTokenCache(
  tenantId: string,
  provider: ERPProviderName,
  ports: OAuthTokenCachePorts = defaultPorts,
): OAuthTokenCache {
  const key = `erp:oauth:${tenantId}:${provider}`;

  return {
    async get() {
      try {
        return await ports.get(key);
      } catch {
        return null; // Redis fora do ar — adapter cai pro token-exchange normal.
      }
    },
    async set(token, ttlSec) {
      if (ttlSec <= 0) return;
      try {
        await ports.set(key, token, 'EX', ttlSec);
      } catch {
        // Redis fora do ar — ignora, o próximo getAccessToken() reautentica.
      }
    },
  };
}
