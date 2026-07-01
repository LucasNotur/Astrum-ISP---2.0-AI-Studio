import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import type { DecodedIdToken } from 'firebase-admin/auth'

// ── Mocks ──────────────────────────────────────────────────
vi.mock('firebase-admin/auth', () => {
  // verifyIdToken precisa ser estável entre chamadas: o middleware chama getAuth()
  // de novo, e antes cada chamada devolvia um mock novo (por isso o teste falhava).
  const verifyIdToken = vi.fn()
  return { getAuth: () => ({ verifyIdToken }) }
})

vi.mock('../../lib/tokenBlacklist', () => ({
  isTokenBlacklisted:    vi.fn().mockResolvedValue(false),
  getUserRevokeTimestamp: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../lib/tokenCache', () => ({
  getCachedToken: vi.fn().mockReturnValue(null),
  setCachedToken: vi.fn(),
}))

import { getAuth }                from 'firebase-admin/auth'
import { isTokenBlacklisted, getUserRevokeTimestamp } from '../../lib/tokenBlacklist'
import { getCachedToken }         from '../../lib/tokenCache'
import {
  requireAuth,
  requireAdminAuth,
  requireSuperAdminAuth,
  requireTenantAccess,
} from '../../middleware/auth'

// ── Helpers ────────────────────────────────────────────────
const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000'

function makeDecodedToken(overrides: Partial<DecodedIdToken> = {}): DecodedIdToken {
  return {
    uid:      'test-uid',
    iat:      Math.floor(Date.now() / 1000) - 60,
    exp:      Math.floor(Date.now() / 1000) + 3600,
    aud:      'astrum-prod',
    iss:      'https://securetoken.google.com/astrum-prod',
    sub:      'test-uid',
    jti:      'test-jti',
    role:     'user',
    tenantId: TENANT_ID,
    ...overrides,
  } as DecodedIdToken
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
    const decoded = makeDecodedToken()
    ;(getAuth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue(decoded)

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
    ;(getAuth().verifyIdToken as ReturnType<typeof vi.fn>)
      .mockRejectedValue(new Error('Firebase ID token has expired'))

    const req  = makeReq('expired-token')
    const { res, status, json } = makeRes()
    const next = makeNext()

    await requireAuth(req as Request, res as Response, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_EXPIRED' }))
  })

  it('retorna 401 quando token está na blacklist', async () => {
    const decoded = makeDecodedToken()
    ;(getAuth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue(decoded)
    ;(isTokenBlacklisted as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true)

    const req  = makeReq('blacklisted-token')
    const { res, status, json } = makeRes()
    const next = makeNext()

    await requireAuth(req as Request, res as Response, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_BLACKLISTED' }))
  })

  it('retorna 401 quando usuário teve tokens revogados globalmente', async () => {
    const decoded = makeDecodedToken({ iat: 1000 })
    ;(getAuth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue(decoded)
    ;(getUserRevokeTimestamp as ReturnType<typeof vi.fn>).mockResolvedValueOnce(2000)

    const req  = makeReq('old-token')
    const { res, status, json } = makeRes()
    const next = makeNext()

    await requireAuth(req as Request, res as Response, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'USER_TOKENS_REVOKED' }))
  })

  it('retorna 401 quando token não tem custom claims', async () => {
    const decoded = makeDecodedToken({ role: undefined, tenantId: undefined } as Partial<DecodedIdToken>)
    ;(getAuth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue(decoded)

    const req  = makeReq('no-claims-token')
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
    const decoded = makeDecodedToken({ role: 'admin' })
    ;(getAuth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue(decoded)

    const req  = makeReq('admin-token')
    const { res, status } = makeRes()
    const next = makeNext()

    await requireAdminAuth(req as Request, res as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(status).not.toHaveBeenCalled()
  })

  it('permite role super_admin', async () => {
    const decoded = makeDecodedToken({ role: 'super_admin' })
    ;(getAuth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue(decoded)

    const req  = makeReq('super-token')
    const { res, status } = makeRes()
    const next = makeNext()

    await requireAdminAuth(req as Request, res as Response, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('retorna 403 para role user', async () => {
    const decoded = makeDecodedToken({ role: 'user' })
    ;(getAuth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue(decoded)

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
    const decoded = makeDecodedToken({ role: 'admin' })
    ;(getAuth().verifyIdToken as ReturnType<typeof vi.fn>).mockResolvedValue(decoded)

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
