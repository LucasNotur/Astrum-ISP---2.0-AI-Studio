import { createHash, randomBytes } from 'crypto';
import { supabaseAdmin } from '../database/supabase.client';
import { infraLogger } from '../logging/logger';
import { READ_ONLY_TOOLS } from '../ai/tool-registry';
import { getEnabledTools, recordToolUsage } from '../ai/tool-registry';

export function isMcpEnabled(): boolean {
  return (process.env.MCP_SERVER_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function generateApiKey(): { plaintext: string; hash: string } {
  const plaintext = `astrum_mcp_${randomBytes(24).toString('hex')}`;
  return { plaintext, hash: hashKey(plaintext) };
}

export interface McpKeyInfo {
  id: string;
  tenantId: string;
  name: string;
  enabled: boolean;
  tools: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

export async function authenticateKey(
  bearerToken: string,
): Promise<McpKeyInfo | null> {
  const hash = hashKey(bearerToken);
  const { data, error } = await supabaseAdmin
    .from('mcp_api_keys')
    .select('id, tenant_id, name, enabled, tools, last_used_at, created_at')
    .eq('key_hash', hash)
    .maybeSingle();

  if (error || !data) return null;
  if (!data.enabled) return null;

  supabaseAdmin
    .from('mcp_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {}, () => {});

  return {
    id: data.id,
    tenantId: data.tenant_id,
    name: data.name,
    enabled: data.enabled,
    tools: data.tools,
    lastUsedAt: data.last_used_at,
    createdAt: data.created_at,
  };
}

export async function resolveTools(
  keyInfo: McpKeyInfo,
): Promise<string[]> {
  const enabledMap = await getEnabledTools(keyInfo.tenantId);
  const enabledNames = new Set(Object.keys(enabledMap));
  return keyInfo.tools.filter(
    (t) => READ_ONLY_TOOLS.has(t) && enabledNames.has(t),
  );
}

export async function createKey(
  tenantId: string,
  name: string,
  tools: string[],
): Promise<{ id: string; plaintext: string }> {
  const safeTools = tools.filter((t) => READ_ONLY_TOOLS.has(t));
  if (safeTools.length === 0) {
    throw new Error('Nenhuma tool read-only selecionada');
  }

  const { plaintext, hash } = generateApiKey();
  const { data, error } = await supabaseAdmin
    .from('mcp_api_keys')
    .insert({
      tenant_id: tenantId,
      name,
      key_hash: hash,
      tools: safeTools,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Falha ao criar chave');
  return { id: data.id, plaintext };
}

export async function listKeys(tenantId: string): Promise<McpKeyInfo[]> {
  const { data, error } = await supabaseAdmin
    .from('mcp_api_keys')
    .select('id, tenant_id, name, enabled, tools, last_used_at, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map((d) => ({
    id: d.id,
    tenantId: d.tenant_id,
    name: d.name,
    enabled: d.enabled,
    tools: d.tools,
    lastUsedAt: d.last_used_at,
    createdAt: d.created_at,
  }));
}

export async function updateKey(
  tenantId: string,
  keyId: string,
  update: { enabled?: boolean; tools?: string[] },
): Promise<boolean> {
  const patch: Record<string, unknown> = {};
  if (update.enabled !== undefined) patch.enabled = update.enabled;
  if (update.tools) patch.tools = update.tools.filter((t) => READ_ONLY_TOOLS.has(t));

  const { error } = await supabaseAdmin
    .from('mcp_api_keys')
    .update(patch)
    .eq('id', keyId)
    .eq('tenant_id', tenantId);

  return !error;
}

export async function deleteKey(
  tenantId: string,
  keyId: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('mcp_api_keys')
    .delete()
    .eq('id', keyId)
    .eq('tenant_id', tenantId);

  return !error;
}
