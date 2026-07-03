import type { Request, Response, NextFunction } from 'express'
import { verifySupabaseToken, TokenVerifyError } from '../lib/authVerify'
import { z }                                    from 'zod'
import pino                                     from 'pino'
import type {
  AstrumDecodedToken,
  AuthenticatedRequest,
  AdminRequest,
} from './auth.types'
import {
  isTokenBlacklisted,
  getUserRevokeTimestamp,
} from '../lib/tokenBlacklist'
import {
  getCachedToken,
  setCachedToken,
} from '../lib/tokenCache'

// ─────────────────────────────────────────────────────────
// Logger — usa o Pino já configurado no projeto
// ─────────────────────────────────────────────────────────
const logger = pino({ name: 'auth-middleware' })

// ─────────────────────────────────────────────────────────
// Schema Zod para validar os custom claims do token
// Espelha o que setAdminClaim.ts escreve no Firebase
// ─────────────────────────────────────────────────────────
const AstrumClaimsSchema = z.object({
  role:     z.enum(['admin', 'super_admin', 'agent', 'user']),
  tenantId: z.string().uuid({ message: 'tenantId deve ser UUID' }),
})

// ─────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token.length > 0 ? token : null
}

function unauthorized(res: Response, message: string, code: string): void {
  res.status(401).json({ error: 'unauthorized', message, code })
}

function forbidden(res: Response, message: string, code: string): void {
  res.status(403).json({ error: 'forbidden', message, code })
}

/**
 * Verifica e decodifica o Firebase ID token.
 * Fluxo:
 *   1. Checa cache em memória (evita chamada ao Firebase)
 *   2. Verifica token no Firebase Admin SDK
 *   3. Valida custom claims com Zod
 *   4. Checa blacklist (jti individual)
 *   5. Checa revogação global do usuário (revokeAllUserTokens)
 *   6. Guarda no cache
 */
async function verifyAndDecodeToken(rawToken: string): Promise<AstrumDecodedToken> {

  // 1. Cache hit — ainda validamos blacklist mesmo no cache
  const cached = getCachedToken(rawToken)
  if (cached) {
    // Blacklist check mesmo no cache — revogação deve ser imediata
    if (cached.jti && await isTokenBlacklisted(cached.jti)) {
      throw new AuthError('TOKEN_BLACKLISTED', 'Token revogado')
    }
    const revokeTs = await getUserRevokeTimestamp(cached.uid)
    if (revokeTs && cached.iat < revokeTs) {
      throw new AuthError('USER_TOKENS_REVOKED', 'Sessão encerrada pelo administrador')
    }
    return cached
  }

  // 2. Verificar JWT Supabase (FZ-3 — assinatura HS256 + claims da tabela users)
  // A revogação continua sendo nossa, via Redis (blacklist + revoke global).
  let decoded
  try {
    decoded = await verifySupabaseToken(rawToken)
  } catch (err: unknown) {
    if (err instanceof TokenVerifyError) {
      throw new AuthError(err.code, err.message)
    }
    throw new AuthError('TOKEN_VERIFY_FAILED', 'Falha na verificação do token')
  }

  // 3. Validar claims com Zod (defesa em profundidade — authVerify já garante)
  const claimsResult = AstrumClaimsSchema.safeParse({
    role:     decoded.role,
    tenantId: decoded.tenantId,
  })
  if (!claimsResult.success) {
    logger.warn(
      { uid: decoded.uid, issues: claimsResult.error.issues },
      'Token sem claims válidos — usuário não configurado',
    )
    throw new AuthError(
      'MISSING_CLAIMS',
      'Usuário sem permissões configuradas. Contate o administrador.',
    )
  }

  const fullDecoded = decoded as AstrumDecodedToken

  // 4. Blacklist individual por jti
  if (fullDecoded.jti && await isTokenBlacklisted(fullDecoded.jti)) {
    throw new AuthError('TOKEN_BLACKLISTED', 'Token revogado')
  }

  // 5. Revogação global do usuário
  const revokeTs = await getUserRevokeTimestamp(fullDecoded.uid)
  if (revokeTs && fullDecoded.iat < revokeTs) {
    throw new AuthError('USER_TOKENS_REVOKED', 'Sessão encerrada pelo administrador')
  }

  // 6. Guardar no cache
  setCachedToken(rawToken, fullDecoded)

  return fullDecoded
}

// ─────────────────────────────────────────────────────────
// Erro tipado interno — não vaza detalhes para o cliente
// ─────────────────────────────────────────────────────────
class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

// ─────────────────────────────────────────────────────────
// MIDDLEWARE 1: requireAuth
// Verifica que o usuário está autenticado (qualquer role).
// Popula req.user com o token decodificado.
// Uso: rotas que qualquer usuário autenticado pode acessar.
// ─────────────────────────────────────────────────────────
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawToken = extractBearerToken(req)

  if (!rawToken) {
    unauthorized(res, 'Token de autenticação não fornecido', 'NO_TOKEN')
    return
  }

  try {
    const decoded = await verifyAndDecodeToken(rawToken)
    ;(req as AuthenticatedRequest).user = decoded
    next()
  } catch (err) {
    if (err instanceof AuthError) {
      logger.warn(
        { code: err.code, path: req.path, method: req.method },
        `Auth falhou: ${err.code}`,
      )
      unauthorized(res, err.message, err.code)
      return
    }
    logger.error({ err, path: req.path }, 'Erro inesperado no requireAuth')
    unauthorized(res, 'Erro de autenticação', 'AUTH_ERROR')
  }
}

// ─────────────────────────────────────────────────────────
// MIDDLEWARE 2: requireAdminAuth
// Verifica autenticação + role admin ou super_admin.
// Uso: /api/super-admin, /api/queues, /api/dlq
// ─────────────────────────────────────────────────────────
export async function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawToken = extractBearerToken(req)

  if (!rawToken) {
    unauthorized(res, 'Token de autenticação não fornecido', 'NO_TOKEN')
    return
  }

  try {
    const decoded = await verifyAndDecodeToken(rawToken)

    if (decoded.role !== 'admin' && decoded.role !== 'super_admin') {
      logger.warn(
        { uid: decoded.uid, role: decoded.role, path: req.path },
        'Acesso admin negado — role insuficiente',
      )
      forbidden(res, 'Acesso restrito a administradores', 'INSUFFICIENT_ROLE')
      return
    }

    ;(req as AdminRequest).user = decoded as AdminRequest['user']

    logger.info(
      { uid: decoded.uid, role: decoded.role, tenantId: decoded.tenantId, path: req.path },
      'Admin autenticado',
    )

    next()
  } catch (err) {
    if (err instanceof AuthError) {
      logger.warn(
        { code: err.code, path: req.path },
        `Admin auth falhou: ${err.code}`,
      )
      unauthorized(res, err.message, err.code)
      return
    }
    logger.error({ err, path: req.path }, 'Erro inesperado no requireAdminAuth')
    unauthorized(res, 'Erro de autenticação', 'AUTH_ERROR')
  }
}

// ─────────────────────────────────────────────────────────
// MIDDLEWARE 3: requireSuperAdminAuth
// Apenas super_admin — para operações cross-tenant.
// Uso: endpoints de gestão da plataforma Astrum inteira.
// ─────────────────────────────────────────────────────────
export async function requireSuperAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawToken = extractBearerToken(req)

  if (!rawToken) {
    unauthorized(res, 'Token de autenticação não fornecido', 'NO_TOKEN')
    return
  }

  try {
    const decoded = await verifyAndDecodeToken(rawToken)

    if (decoded.role !== 'super_admin') {
      logger.warn(
        { uid: decoded.uid, role: decoded.role, path: req.path },
        'Acesso super_admin negado',
      )
      // 404 deliberado — não confirma que o endpoint existe para roles menores
      res.status(404).json({ error: 'not_found' })
      return
    }

    ;(req as AdminRequest).user = decoded as AdminRequest['user']
    next()
  } catch (err) {
    if (err instanceof AuthError) {
      unauthorized(res, err.message, err.code)
      return
    }
    logger.error({ err, path: req.path }, 'Erro inesperado no requireSuperAdminAuth')
    unauthorized(res, 'Erro de autenticação', 'AUTH_ERROR')
  }
}

// ─────────────────────────────────────────────────────────
// MIDDLEWARE 4: requireTenantAccess(tenantId)
// Garante que o usuário autenticado pertence ao tenant
// do parâmetro de rota. Usar APÓS requireAuth.
// Uso: /api/tenants/:tenantId/* — isolamento multi-tenant
//
// Exemplo:
//   router.get(
//     '/tenants/:tenantId/customers',
//     requireAuth,
//     requireTenantAccess('tenantId'),
//     customersHandler,
//   )
// ─────────────────────────────────────────────────────────
export function requireTenantAccess(paramName = 'tenantId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user    = (req as AuthenticatedRequest).user
    const reqTenant = req.params[paramName]

    if (!user) {
      // requireAuth deve vir antes
      unauthorized(res, 'Autenticação necessária', 'NOT_AUTHENTICATED')
      return
    }

    // super_admin pode acessar qualquer tenant
    if (user.role === 'super_admin') {
      next()
      return
    }

    if (user.tenantId !== reqTenant) {
      logger.warn(
        { uid: user.uid, userTenant: user.tenantId, reqTenant, path: req.path },
        'Tentativa de acesso cross-tenant bloqueada',
      )
      // 404 deliberado — não confirmar que o tenant existe para o atacante
      res.status(404).json({ error: 'not_found' })
      return
    }

    next()
  }
}
