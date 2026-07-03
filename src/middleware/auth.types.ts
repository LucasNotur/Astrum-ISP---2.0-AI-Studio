import type { Request } from 'express'

// FZ-3: shape do JWT Supabase decodificado (substitui DecodedIdToken do Firebase).
// Claims role/tenantId vêm da tabela users (ver src/lib/authVerify.ts).
export interface SupabaseTokenBase {
  uid: string
  sub: string
  email?: string
  iat: number
  exp: number
  jti?: string
  [key: string]: any
}

export interface AstrumClaims {
  role: 'admin' | 'super_admin' | 'agent' | 'user'
  tenantId: string
}

// Token decodificado com claims Astrum garantidas
export type AstrumDecodedToken = SupabaseTokenBase & AstrumClaims

// Request autenticado — disponível após requireAuth passar
export interface AuthenticatedRequest extends Request {
  user: AstrumDecodedToken
}

// Request autenticado como admin — disponível após requireAdminAuth passar
export interface AdminRequest extends AuthenticatedRequest {
  user: AstrumDecodedToken & { role: 'admin' | 'super_admin' }
}
