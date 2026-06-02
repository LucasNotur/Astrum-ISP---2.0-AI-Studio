import { supabaseAdmin } from '../database/supabase.client';
import { securityLogger } from '../logging/logger';
import crypto from 'node:crypto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // segundos
}

export interface TokenPayload {
  userId: string;
  tenantId: string;
  role: 'super_admin' | 'admin' | 'operator' | 'viewer';
}

/**
 * Gera um par de tokens: access (15min) + refresh (7 dias).
 * O access token é um JWT assinado pelo Fastify.
 * O refresh token é um token opaco aleatório (não é JWT).
 */
export async function generateTokenPair(
  fastify: any,
  payload: TokenPayload,
  meta: { userAgent?: string; ipAddress?: string } = {}
): Promise<TokenPair> {
  // Access token: JWT com expiração curta
  const accessToken = fastify.jwt.sign(payload, { expiresIn: '15m' });

  // Refresh token: token opaco aleatório (não é JWT)
  const refreshToken = crypto.randomBytes(64).toString('hex');

  // Salvar refresh token no banco
  const { error } = await supabaseAdmin.from('refresh_tokens').insert({
    token: refreshToken,
    user_id: payload.userId,
    tenant_id: payload.tenantId,
    user_agent: meta.userAgent,
    ip_address: meta.ipAddress,
  });

  if (error) {
    securityLogger.error({ err: error, userId: payload.userId }, 'Erro ao salvar refresh token');
    throw new Error('Falha ao criar sessão. Tente novamente.');
  }

  await supabaseAdmin.from('audit_log').insert({
    tenant_id: payload.tenantId,
    user_id: payload.userId,
    action: 'login',
    ip_address: meta.ipAddress,
    user_agent: meta.userAgent,
  });

  securityLogger.info({ userId: payload.userId, tenantId: payload.tenantId }, 'Token pair gerado');

  return { accessToken, refreshToken, expiresIn: 15 * 60 };
}

/**
 * Usa um refresh token para gerar um novo par de tokens.
 * O refresh token usado é revogado e um novo é gerado (rotation).
 */
export async function rotateTokens(
  fastify: any,
  refreshToken: string,
  meta: { userAgent?: string; ipAddress?: string } = {}
): Promise<TokenPair> {
  // Buscar token no banco
  const { data: tokenRecord } = await supabaseAdmin
    .from('refresh_tokens')
    .select('user_id, tenant_id, expires_at, revoked')
    .eq('token', refreshToken)
    .single();

  if (!tokenRecord) {
    securityLogger.warn({ refreshToken: refreshToken.slice(0, 8) + '...' }, 'Refresh token não encontrado');
    throw new Error('Token inválido.');
  }

  if (tokenRecord.revoked) {
    securityLogger.error({ userId: tokenRecord.user_id }, '⚠️ Token revogado usado — possível roubo de sessão');
    // Revogar TODOS os tokens do usuário (medida de segurança)
    await supabaseAdmin
      .from('refresh_tokens')
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq('user_id', tokenRecord.user_id);

    await supabaseAdmin.from('audit_log').insert({
      user_id: tokenRecord.user_id,
      action: 'suspicious_token_reuse',
      metadata: { token_prefix: refreshToken.slice(0, 8) },
    });

    throw new Error('Sessão expirada por segurança. Faça login novamente.');
  }

  if (new Date(tokenRecord.expires_at) < new Date()) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  // Revogar token atual
  await supabaseAdmin
    .from('refresh_tokens')
    .update({ revoked: true, revoked_at: new Date().toISOString() })
    .eq('token', refreshToken);

  // Buscar dados do usuário para o novo payload
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', tokenRecord.user_id)
    .single();

  // Gerar novo par
  return generateTokenPair(
    fastify,
    {
      userId: tokenRecord.user_id,
      tenantId: tokenRecord.tenant_id,
      role: user?.role ?? 'operator',
    },
    meta
  );
}

/**
 * Revoga todos os refresh tokens de um usuário (logout).
 */
export async function revokeAllTokens(userId: string): Promise<void> {
  await supabaseAdmin
    .from('refresh_tokens')
    .update({ revoked: true, revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('revoked', false);

  securityLogger.info({ userId }, 'Todos os tokens do usuário revogados (logout)');
}
