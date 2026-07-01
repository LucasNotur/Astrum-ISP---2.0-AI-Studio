/**
 * Login Response — decide o corpo da resposta de login considerando force_reset (S77).
 * Puro e testável. Se o usuário foi migrado do Firebase (must_reset_password), o login
 * NÃO entrega tokens de sessão plena: sinaliza que ele precisa redefinir a senha antes.
 */

export interface LoginUserRow {
  id: string;
  tenant_id: string;
  role: string;
  must_reset_password?: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export type LoginResult =
  | { kind: 'reset_required'; userId: string; message: string }
  | { kind: 'ok'; tokens: TokenPair };

export function buildLoginResult(user: LoginUserRow, tokens: TokenPair): LoginResult {
  if (user.must_reset_password) {
    return {
      kind: 'reset_required',
      userId: user.id,
      message: 'Por segurança, defina uma nova senha para continuar.',
    };
  }
  return { kind: 'ok', tokens };
}
