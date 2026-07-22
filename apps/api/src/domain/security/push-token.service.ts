/**
 * Dossiê #103 — Múltiplos Tokens Sessão App Nativo (Push).
 * Gerencia tokens de push notification por dispositivo,
 * permitindo múltiplas sessões simultâneas por operador.
 */

export interface PushToken {
  id: string;
  tenantId: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceName?: string;
  lastUsedAt: string;
  createdAt: string;
  isActive: boolean;
}

export interface PushPorts {
  listTokens: (tenantId: string, userId: string) => Promise<PushToken[]>;
  registerToken: (token: Omit<PushToken, 'id' | 'createdAt'>) => Promise<PushToken>;
  deactivateToken: (tokenId: string) => Promise<void>;
  deactivateAllForUser: (tenantId: string, userId: string) => Promise<number>;
  sendPush: (tokens: string[], title: string, body: string, data?: Record<string, string>) => Promise<{ sent: number; failed: number }>;
}

const MAX_TOKENS_PER_USER = 10;

export function deduplicateTokens(tokens: PushToken[]): PushToken[] {
  const seen = new Map<string, PushToken>();
  for (const t of tokens) {
    const existing = seen.get(t.token);
    if (!existing || t.lastUsedAt > existing.lastUsedAt) {
      seen.set(t.token, t);
    }
  }
  return [...seen.values()];
}

export function groupByPlatform(tokens: PushToken[]): Record<string, PushToken[]> {
  const grouped: Record<string, PushToken[]> = {};
  for (const t of tokens) {
    (grouped[t.platform] ??= []).push(t);
  }
  return grouped;
}

export async function registerPushToken(
  tenantId: string,
  userId: string,
  token: string,
  platform: PushToken['platform'],
  deviceName: string | undefined,
  ports: PushPorts,
): Promise<{ ok: boolean; pushToken?: PushToken; evicted?: number; error?: string }> {
  if (!token || token.length < 10) {
    return { ok: false, error: 'Token inválido (mínimo 10 caracteres)' };
  }

  const existing = await ports.listTokens(tenantId, userId);
  const duplicate = existing.find((t) => t.token === token && t.isActive);
  if (duplicate) return { ok: true, pushToken: duplicate, evicted: 0 };

  let evicted = 0;
  if (existing.filter((t) => t.isActive).length >= MAX_TOKENS_PER_USER) {
    const oldest = [...existing]
      .filter((t) => t.isActive)
      .sort((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt))[0];
    if (oldest) {
      await ports.deactivateToken(oldest.id);
      evicted = 1;
    }
  }

  const pushToken = await ports.registerToken({
    tenantId, userId, token, platform, deviceName,
    lastUsedAt: new Date().toISOString(), isActive: true,
  });

  return { ok: true, pushToken, evicted };
}

export async function sendPushToUser(
  tenantId: string,
  userId: string,
  title: string,
  body: string,
  data: Record<string, string> | undefined,
  ports: PushPorts,
): Promise<{ ok: boolean; sent: number; failed: number; error?: string }> {
  const tokens = await ports.listTokens(tenantId, userId);
  const activeTokens = tokens.filter((t) => t.isActive);

  if (activeTokens.length === 0) {
    return { ok: false, sent: 0, failed: 0, error: 'Nenhum token push ativo para este usuário' };
  }

  const tokenStrings = activeTokens.map((t) => t.token);
  const result = await ports.sendPush(tokenStrings, title, body, data);
  return { ok: result.sent > 0, ...result };
}
