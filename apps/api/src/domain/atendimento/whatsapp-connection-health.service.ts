/**
 * Saúde da CONEXÃO WhatsApp (card "Saúde do WhatsApp" no MonitoringPage).
 *
 * Não confundir com whatsapp-health.service.ts (ban_signals/fila — saúde de ENVIO,
 * card do WhatsAppPage). Este arquivo responde "o WhatsApp está aberto agora?".
 *
 * Antes disso existiam 3 fontes divergentes e sem sincronia:
 *   1. `tenants.whatsapp_health` — coluna que nunca existiu no Supabase (vestígio
 *      do Firestore pré-migração, sempre null).
 *   2. `tenants.integration_keys->>'whatsappStatus'` — write-only, gravado pelo
 *      webhook Evolution legado a cada `connection.update` real; é o ÚLTIMO ESTADO
 *      CONHECIDO, mas pode estar velho (Evolution caiu sem mandar evento).
 *   3. `/api/health/whatsapp` (Express raiz) — STUB hardcoded, sempre "open".
 *
 * Decisão: em vez de confiar num cache (#2) que pode estar velho, este endpoint faz
 * um CHECK ATIVO na Evolution API (GET /instance/connectionState/{instance}), mesmo
 * padrão que o WhatsAppPage já usa via /api/v2/evolution/proxy. Isso elimina o falso
 * positivo do stub: se a Evolution não responde, o card mostra 'unknown', não 'open'.
 * A instância do tenant é resolvida via `tenant_evolution_instances` (S71,
 * multi-instância) com fallback em `tenants.evolution_instance` (single legado) —
 * mesma ordem de resolução usada em evolution-webhook.routes.ts.
 */

export type ConnectionHealthStatus = 'open' | 'close' | 'connecting' | 'unknown' | 'not_configured';

export interface ConnectionHealthResult {
  status: ConnectionHealthStatus;
  instance: string | null;
  checked_at: string;
  error?: string;
}

/** Mapeia o `state` cru da Evolution API pro enum canônico. */
export function mapEvolutionState(raw: unknown): ConnectionHealthStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'open' || s === 'close' || s === 'connecting') return s;
  return 'unknown';
}

export interface ConnectionHealthDeps {
  /** Resolve a instância do tenant: tenant_evolution_instances (1ª linha) → tenants.evolution_instance. */
  resolveInstance: (tenantId: string) => Promise<string | null>;
  /** Credenciais efetivas (evolutionUrl/evolutionApiKey) do tenant. */
  resolveKeys: (tenantId: string) => Promise<{ evolutionUrl: string; evolutionApiKey: string }>;
  /** Monta a URL de destino (mesmo guard SSRF do proxy) e faz o GET. Lança em falha de rede/timeout. */
  pingConnectionState: (evolutionUrl: string, apikey: string, instance: string) => Promise<unknown>;
  /** Injetável para teste; default `new Date()`. */
  now?: Date;
}

/**
 * Orquestra a checagem ativa. Nunca lança — falha de rede vira status 'unknown',
 * porque este é um indicador de dashboard, não uma verdade transacional (mesma
 * filosofia tolerante de whatsapp-health.service.ts).
 */
export async function checkWhatsAppConnectionHealth(
  tenantId: string,
  deps: ConnectionHealthDeps,
): Promise<ConnectionHealthResult> {
  const checked_at = (deps.now ?? new Date()).toISOString();

  const instance = await deps.resolveInstance(tenantId);
  if (!instance) {
    return { status: 'not_configured', instance: null, checked_at };
  }

  try {
    const { evolutionUrl, evolutionApiKey } = await deps.resolveKeys(tenantId);
    const raw = await deps.pingConnectionState(evolutionUrl, evolutionApiKey, instance);
    const state = (raw as any)?.instance?.state ?? (raw as any)?.state;
    return { status: mapEvolutionState(state), instance, checked_at };
  } catch (err) {
    return { status: 'unknown', instance, checked_at, error: (err as Error).message };
  }
}
