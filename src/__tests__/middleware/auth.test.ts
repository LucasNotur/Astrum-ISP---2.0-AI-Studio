import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import type { AstrumDecodedToken } from '../../middleware/auth.types'

// ── Mocks ──────────────────────────────────────────────────
// FZ-3: o middleware verifica JWT Supabase via lib/authVerify (era firebase-admin/auth).
// Mock parcial: verifySupabaseToken vira vi.fn(); TokenVerifyError continua a classe real
// (o middleware usa instanceof).
vi.mock('../../lib/authVerify', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/authVerify')>()
  return {
    ...original,
    verifySupabaseToken: vi.fn(),
  }
})

vi.mock('../../lib/tokenBlacklist', () => ({
  isTokenBlacklisted:    vi.fn().mockResolvedValue(false),
  getUserRevokeTimestamp: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../lib/tokenCache', () => ({
  getCachedToken: vi.fn().mockReturnValue(null),
  setCachedToken: vi.fn(),
}))

import { verifySupabaseToken, TokenVerifyError } from '../../lib/authVerify'
import { isTokenBlacklisted, getUserRevokeTimestamp } from '../../lib/tokenBlacklist'
import {
  requireAuth,
  requireAdminAuth,
  requireSuperAdminAuth,
  requireTenantAccess,
} from '../../middleware/auth'

const mockVerify = verifySupabaseToken as ReturnType<typeof vi.fn>

// ── Helpers ────────────────────────────────────────────────
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000'

function makeDecodedToken(overrides: Partial<AstrumDecodedToken> = {}): AstrumDecodedToken {
  return {
    uid:      'test-uid',
    sub:      'test-uid',
    iat:      Math.floor(Date.now() / 1000) - 60,
    exp:      Math.floor(Date.now() / 1000) + 3600,
    jti:      'test-jti',
    role:     'user',
    tenantId: TENANT_ID,
    ...overrides,
  } as AstrumDecodedToken
}

function makeReq(token?: string, params: Record<string, string> = {}): Partial<Request> {
  return {
    headers:       { authorization: token ? `Bearer ${token}` : undefined },
    params,
    path:          '/test',
    method:        'GET',
  }
}

function makeRes(): { res: Partial<Response>; status: MockedFunction<Response['status']>; json: MockedFunction<Response['json']> } {
  const json   = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  return { res: { status, json } as unknown as Partial<Response>, status, json }
}

function makeNext(): NextFunction {
  return vi.fn()
}

// ── requireAuth ────────────────────────────────────────────
describe('requireAuth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('chama next() com token válido e claims corretos', async () => {
    mockVerify.mockResolvedValue(makeDecodedToken())

    const req  = makeReq('valid-token')
    const { res, status } = makeRes()
    const next = makeNext()

    await requireAuth(req as Request, res as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(status).not.toHaveBeenCalled()
    expect((req as Record<string, unknown>).user).toBeDefined()
  })

  it('retorna 401 sem Authorization header', async () => {
    const req  = makeReq()
    const { res, status, json } = makeRes()
    const next = makeNext()

    await requireAuth(req as Request, res as Response, next)

    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NO_TOKEN' }))
  })

  it('retorna 401 com token expirado', async () => {
    mockVerify.mockRejectedValue(
      new TokenVerifyError('TOKEN_EXPIRED', 'Token expirado — faça login novamente'),
    )

    const req  = makeReq('expired-token')
    const { res, status, json } = makeRes()
    const next = makeNext()

    await requireAuth(req as Request, res as Response, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_EXPIRED' }))
  })

  it('retorna 401 quando token está na blacklist', async () => {
    mockVerify.mockResolvedValue(makeDecodedToken())
    ;(isTokenBlacklisted as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true)

    const req  = makeReq('blacklisted-token')
    const { res, status, json } = makeRes()
    const next = makeNext()

    await requireAuth(req as Request, res as Response, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_BLACKLISTED' }))
  })

  it('retorna 401 quando usuário teve tokens revogados globalmente', async () => {
    mockVerify.mockResolvedValue(makeDecodedToken({ iat: 1000 }))
    ;(getUserRevokeTimestamp as ReturnType<typeof vi.fn>).mockResolvedValueOnce(2000)

    const req  = makeReq('old-token')
    const { res, status, json } = makeRes()
    const next = makeNext()

    await requireAuth(req as Request, res as Response, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'USER_TOKENS_REVOKED' }))
  })

  it('retorna 401 quando usuário não tem claims configurados', async () => {
    mockVerify.mockRejectedValue(
      new TokenVerifyError('MISSING_CLAIMS', 'Usuário sem permissões configuradas.'),
    )

    const req  = makeReq('no-claims-token')
    const { res, status, json } = makeRes()
    const next = makeNext()

    await requireAuth(req as Request, res as Response, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MISSING_CLAIMS' }))
  })

  it('retorna 401 MISSING_CLAIMS quando o token decodificado vem sem role/tenantId', async () => {
    mockVerify.mockResolvedValue(
      makeDecodedToken({ role: undefined, tenantId: undefined } as any),
    )

    const req  = makeReq('bad-claims-token')
    const { res, status, json } = makeRes()
    const next = makeNext()

    await requireAuth(req as Request, res as Response, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'MISSING_CLAIMS' }))
  })
})

// ── requireAdminAuth ───────────────────────────────────────
describe('requireAdminAuth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('permite role admin', async () => {
    mockVerify.mockResolvedValue(makeDecodedToken({ role: 'admin' }))

    const req  = makeReq('admin-token')
    const { res, status } = makeRes()
    const next = makeNext()

    await requireAdminAuth(req as Request, res as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(status).not.toHaveBeenCalled()
  })

  it('permite role super_admin', async () => {
    mockVerify.mockResolvedValue(makeDecodedToken({ role: 'super_admin' }))

    const req  = makeReq('super-token')
    const { res } = makeRes()
    const next = makeNext()

    await requireAdminAuth(req as Request, res as Response, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('retorna 403 para role user', async () => {
    mockVerify.mockResolvedValue(makeDecodedToken({ role: 'user' }))

    const req  = makeReq('user-token')
    const { res, status, json } = makeRes()
    const next = makeNext()

    await requireAdminAuth(req as Request, res as Response, next)

    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(403)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INSUFFICIENT_ROLE' }))
  })
})

// ── requireSuperAdminAuth ──────────────────────────────────
describe('requireSuperAdminAuth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna 404 para role admin (obscuridade deliberada)', async () => {
    mockVerify.mockResolvedValue(makeDecodedToken({ role: 'admin' }))

    const req  = makeReq('admin-token')
    const { res, status, json } = makeRes()
    const next = makeNext()

    await requireSuperAdminAuth(req as Request, res as Response, next)

    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(404)
    expect(json).toHaveBeenCalledWith({ error: 'not_found' })
  })
})

// ── requireTenantAccess ────────────────────────────────────
describe('requireTenantAccess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('permite acesso ao próprio tenant', () => {
    const req = {
      ...makeReq(),
      user:   makeDecodedToken({ role: 'user', tenantId: TENANT_ID }),
      params: { tenantId: TENANT_ID },
    }
    const { res, status } = makeRes()
    const next = makeNext()

    requireTenantAccess('tenantId')(req as unknown as Request, res as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(status).not.toHaveBeenCalled()
  })

  it('bloqueia acesso cross-tenant com 404', () => {
    const req = {
      ...makeReq(),
      user:   makeDecodedToken({ role: 'user', tenantId: TENANT_ID }),
      params: { tenantId: 'outro-tenant-id-qualquer' },
    }
    const { res, status, json } = makeRes()
    const next = makeNext()

    requireTenantAccess('tenantId')(req as unknown as Request, res as Response, next)

    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(404)
    expect(json).toHaveBeenCalledWith({ error: 'not_found' })
  })

  it('super_admin bypassa o check de tenant', () => {
    const req = {
      ...makeReq(),
      user:   makeDecodedToken({ role: 'super_admin', tenantId: TENANT_ID }),
      params: { tenantId: 'qualquer-tenant' },
    }
    const { res, status } = makeRes()
    const next = makeNext()

    requireTenantAccess('tenantId')(req as unknown as Request, res as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(status).not.toHaveBeenCalled()
  })
})
