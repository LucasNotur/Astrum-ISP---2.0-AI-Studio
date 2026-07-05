/**
 * FZ-3 — Verificação de JWT Supabase (substitui getAuth().verifyIdToken do Firebase).
 *
 * Fluxo:
 *   1. Verifica assinatura HS256 com a env SUPABASE_JWT_SECRET
 *      (Dashboard Supabase → Settings → API → JWT Secret).
 *   2. Claims role/tenantId não vêm no token por padrão → busca na tabela `users`
 *      (id = sub) com cache em memória (TTL 5 min).
 *   3. Devolve o shape AstrumDecodedToken que o middleware legado já espera
 *      (uid, role, tenantId, jti, iat, email) — blacklist/revogação continuam no middleware.
 *
 * Logs: namespace [authVerify].
 */
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from './supabaseAdmin';

export interface SupabaseDecodedToken {
  uid: string;
  sub: string;
  email?: string;
  role: 'admin' | 'super_admin' | 'agent' | 'user';
  tenantId: string;
  jti?: string;
  iat: number;
  exp: number;
  [key: string]: any;
}

export class TokenVerifyError extends Error {
  constructor(
    public readonly code: 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'MISSING_CLAIMS' | 'TOKEN_VERIFY_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'TokenVerifyError';
  }
}

// Cache de claims por usuário (evita hit no banco a cada request)
const CLAIMS_TTL_MS = 5 * 60 * 1000;
const claimsCache = new Map<string, { role: string; tenantId: string; expires: number }>();

/** Limpa o cache de claims — usar em testes e após mudança de role. */
export function clearClaimsCache(): void {
  claimsCache.clear();
}

async function loadUserClaims(userId: string): Promise<{ role: string; tenantId: string }> {
  const cached = claimsCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return { role: cached.role, tenantId: cached.tenantId };
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('role, tenant_id')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data || !data.role || !data.tenant_id) {
    throw new TokenVerifyError(
      'MISSING_CLAIMS',
      'Usuário sem permissões configuradas. Contate o administrador.',
    );
  }

  claimsCache.set(userId, {
    role: data.role,
    tenantId: data.tenant_id,
    expires: Date.now() + CLAIMS_TTL_MS,
  });

  return { role: data.role, tenantId: data.tenant_id };
}

/**
 * Verifica um access token do Supabase e devolve o token decodificado com
 * claims Astrum (role/tenantId). Lança TokenVerifyError em falha.
 */
export async function verifySupabaseToken(rawToken: string): Promise<SupabaseDecodedToken> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    console.error('[authVerify] SUPABASE_JWT_SECRET não configurado');
    throw new TokenVerifyError('TOKEN_VERIFY_FAILED', 'Verificação de token indisponível');
  }

  let payload: any;
  try {
    payload = jwt.verify(rawToken, secret, { algorithms: ['HS256'] });
  } catch (err: any) {
    if (err?.name === 'TokenExpiredError') {
      throw new TokenVerifyError('TOKEN_EXPIRED', 'Token expirado — faça login novamente');
    }
    throw new TokenVerifyError('TOKEN_INVALID', 'Token inválido');
  }

  const sub: string | undefined = payload?.sub;
  if (!sub) {
    throw new TokenVerifyError('TOKEN_INVALID', 'Token sem subject');
  }

  // Claims podem vir no próprio token (app_metadata via Auth Hook) — usa se presentes
  const tokenRole = payload.app_metadata?.role ?? payload.role_astrum;
  const tokenTenant = payload.app_metadata?.tenant_id ?? payload.tenant_id;

  let role: string;
  let tenantId: string;
  if (tokenRole && tokenTenant && ['admin', 'super_admin', 'agent', 'user'].includes(tokenRole)) {
    role = tokenRole;
    tenantId = tokenTenant;
  } else {
    const claims = await loadUserClaims(sub);
    role = claims.role;
    tenantId = claims.tenantId;
  }

  return {
    ...payload,
    uid: sub,
    sub,
    email: payload.email,
    role: role as SupabaseDecodedToken['role'],
    tenantId,
    jti: payload.jti ?? payload.session_id,
    iat: payload.iat,
    exp: payload.exp,
  };
}

/**
 * Revoga as sessões de todos os usuários de um tenant (ex.: suspensão por billing).
 * Substitui o listUsers + revokeRefreshTokens do Firebase Admin.
 */
export async function revokeTenantUserTokens(
  tenantId: string,
  revokeAllUserTokens: (uid: string) => Promise<void>,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('tenant_id', tenantId);

  if (error || !data) {
    console.error(`[authVerify] revokeTenantUserTokens(${tenantId}): ${error?.message}`);
    return 0;
  }

  for (const row of data) {
    await revokeAllUserTokens(row.id);
    claimsCache.delete(row.id);
  }
  return data.length;
}
