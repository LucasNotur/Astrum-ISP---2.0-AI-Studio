import type { Request } from 'express'
import type { DecodedIdToken } from 'firebase-admin/auth'

// Claims customizadas setadas via Firebase Admin SDK (setCustomUserClaims)
// Espelha exatamente o que está no firestore.rules:
//   request.auth.token.role == 'admin'
//   request.auth.token.tenantId
export interface AstrumClaims {
  role: 'admin' | 'super_admin' | 'agent' | 'user'
  tenantId: string
}

// Token decodificado com claims Astrum garantidas
export type AstrumDecodedToken = DecodedIdToken & AstrumClaims

// Request autenticado — disponível após requireAuth passar
export interface AuthenticatedRequest extends Request {
  user: AstrumDecodedToken
}

// Request autenticado como admin — disponível após requireAdminAuth passar
export interface AdminRequest extends AuthenticatedRequest {
  user: AstrumDecodedToken & { role: 'admin' | 'super_admin' }
}
