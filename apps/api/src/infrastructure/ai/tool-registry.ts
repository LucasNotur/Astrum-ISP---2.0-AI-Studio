import { redis } from '../cache/redis.client';
import { infraLogger } from '../logging/logger';
import { agentTools } from './vercel-ai.service';
import supabase from '../database/supabase.client';

/**
 * IA-19 — Tool registry dinâmico.
 *
 * O catálogo das tools (descrições + schemas Zod) vive em CÓDIGO
 * (`vercel-ai.service.ts → agentTools`). Este módulo resolve em RUNTIME
 * quais tools o modelo recebe, filtrando por tenant via
 * `agent_tool_settings(tenant_id, tool_name, enabled)` cacheado no Redis.
 *
 * Regras:
 * - Flag off = `agentTools` completo (comportamento atual, sem query).
 * - Flag on + Redis ok = aplica cache de 60s; sem cache → carrega do banco.
 * - Qualquer erro (Redis ou Supabase) = fail-OPEN (todas as tools).
 *
 * Apêndice D2 do PARTE2: 4 tools hoje (check_coverage, run_diagnostics,
 * schedule_technical_visit, get_billing_status) são declaradas em
 * `agentTools` mas o executor já as tem — IA-19 apenas liga o catálogo
 * completo ao runtime via `streamWithTools({ tools })`.
 */

const CACHE_TTL_SECONDS = 60;
const CACHE_KEY_PREFIX = 'toolreg';

export function isToolRegistryEnabled(): boolean {
  return (process.env.TOOL_REGISTRY_ENABLED ?? '').trim().toLowerCase() === 'true';
}

function cacheKey(tenantId: string): string {
  return `${CACHE_KEY_PREFIX}:${tenantId}`;
}

/**
 * Carrega do banco a lista de tools DESABILITADAS para o tenant.
 * Tool sem linha = habilitada (default TRUE). Retorna `string[]` (apenas nomes).
 */
async function loadDisabledFromDb(tenantId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('agent_tool_settings')
    .select('tool_name')
    .eq('tenant_id', tenantId)
    .eq('enabled', false);

  if (error) {
    infraLogger.warn({ err: error.message, tenantId }, 'tool-registry: falha ao ler do Supabase');
    throw error;
  }
  return (data ?? []).map((r: any) => r.tool_name);
}

/**
 * Retorna o subconjunto de `agentTools` habilitado para o tenant.
 * Fail-open: qualquer erro devolve o catálogo completo.
 */
export async function getEnabledTools(tenantId: string): Promise<typeof agentTools> {
  if (!isToolRegistryEnabled()) return agentTools;

  try {
    const key = cacheKey(tenantId);
    const cached = await redis.get(key);
    let disabled: string[];
    if (cached) {
      disabled = JSON.parse(cached) as string[];
    } else {
      disabled = await loadDisabledFromDb(tenantId);
      await redis.set(key, JSON.stringify(disabled), 'EX', CACHE_TTL_SECONDS);
    }
    return Object.fromEntries(
      Object.entries(agentTools).filter(([name]) => !disabled.includes(name)),
    ) as typeof agentTools;
  } catch (err) {
    infraLogger.warn(
      { err: (err as Error).message, tenantId },
      'tool-registry: indisponível — fail-open (todas as tools)',
    );
    return agentTools;
  }
}

/**
 * Invalida o cache de tools do tenant (chamado pelo PATCH /ia/tools/:name).
 */
export async function invalidateToolRegistry(tenantId: string): Promise<void> {
  if (!isToolRegistryEnabled()) return;
  try {
    await redis.del(cacheKey(tenantId));
  } catch (err) {
    infraLogger.warn(
      { err: (err as Error).message, tenantId },
      'tool-registry: falha ao invalidar cache',
    );
  }
}

/**
 * Upsert da flag enabled de uma tool para o tenant.
 * Retorna false se a tool não existe no catálogo.
 */
export async function setToolEnabled(
  tenantId: string,
  toolName: string,
  enabled: boolean,
  updatedBy?: string,
): Promise<boolean> {
  if (!(toolName in agentTools)) return false;

  const { error } = await supabase.from('agent_tool_settings').upsert(
    {
      tenant_id: tenantId,
      tool_name: toolName,
      enabled,
      updated_by: updatedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,tool_name' },
  );
  if (error) {
    infraLogger.warn({ err: error.message, tenantId, toolName }, 'tool-registry: upsert falhou');
    throw error;
  }
  await invalidateToolRegistry(tenantId);
  return true;
}

export interface ToolCatalogEntry {
  name: string;
  description: string;
  enabled: boolean;
  calls7d: number;
  errors7d: number;
}

/**
 * Lista o catálogo anotado (uso 7d) para a tela de gestão.
 * Se flag off, todas as tools retornam `enabled: true` e uso 0.
 */
export async function listToolCatalog(tenantId: string): Promise<ToolCatalogEntry[]> {
  const enabledMap = await getEnabledTools(tenantId);
  const enabledNames = new Set(Object.keys(enabledMap));

  let usageMap = new Map<string, { calls: number; errors: number }>();
  if (isToolRegistryEnabled()) {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('tool_usage_daily')
        .select('tool_name, calls, errors')
        .eq('tenant_id', tenantId)
        .gte('day', since);
      if (!error && data) {
        for (const row of data as any[]) {
          const acc = usageMap.get(row.tool_name) ?? { calls: 0, errors: 0 };
          acc.calls += Number(row.calls ?? 0);
          acc.errors += Number(row.errors ?? 0);
          usageMap.set(row.tool_name, acc);
        }
      }
    } catch (err) {
      infraLogger.warn(
        { err: (err as Error).message, tenantId },
        'tool-registry: contadores indisponíveis',
      );
    }
  }

  return Object.entries(agentTools).map(([name, def]) => ({
    name,
    description: (def as any).description ?? '',
    enabled: enabledNames.has(name),
    calls7d: usageMap.get(name)?.calls ?? 0,
    errors7d: usageMap.get(name)?.errors ?? 0,
  }));
}

/**
 * Incrementa contador de uso (fire-and-forget). Se o resultado for um erro
 * de tool (campo `error` no retorno), também conta erro.
 */
export function recordToolUsage(
  tenantId: string,
  toolName: string,
  result: unknown,
): void {
  if (!isToolRegistryEnabled()) return;
  const day = new Date().toISOString().slice(0, 10);
  const isError =
    typeof result === 'object' && result !== null && typeof (result as any).error === 'string';

  void (async () => {
    try {
      await supabase.rpc('tool_usage_increment' as any, {
        p_tenant_id: tenantId,
        p_tool_name: toolName,
        p_day: day,
        p_is_error: isError,
      } as any);
    } catch {
      // Tabela não tem RPC: usa upsert manual como fallback.
      try {
        const { data: existing } = await supabase
          .from('tool_usage_daily')
          .select('calls, errors')
          .eq('tenant_id', tenantId)
          .eq('tool_name', toolName)
          .eq('day', day)
          .maybeSingle();
        const calls = ((existing as any)?.calls ?? 0) + 1;
        const errors = ((existing as any)?.errors ?? 0) + (isError ? 1 : 0);
        await supabase.from('tool_usage_daily').upsert(
          { tenant_id: tenantId, tool_name: toolName, day, calls, errors },
          { onConflict: 'tenant_id,tool_name,day' },
        );
      } catch (err) {
        infraLogger.warn(
          { err: (err as Error).message, tenantId, toolName },
          'tool-registry: contador não atualizado',
        );
      }
    }
  })();
}
