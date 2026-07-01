/**
 * Auth User Map — mapeia usuário do Firebase Auth para a tabela `users` do Supabase.
 * Plano Mestre V2, S77.
 *
 * DECISÃO PENDENTE (Lucas): o hash de senha do Firebase (scrypt) NÃO é compatível com
 * Argon2id. Duas estratégias:
 *   - 'force_reset' (default, mais seguro): usuário define nova senha no primeiro login.
 *   - 'hash_import': importar o hash scrypt e verificar com os params do Firebase (exige
 *     guardar os parâmetros scrypt do projeto). Só usar se o reset em massa for inviável.
 * Esta função é pura e não decide sozinha — recebe a estratégia.
 */

export type PasswordStrategy = 'force_reset' | 'hash_import';

export interface FirebaseAuthUser {
  uid: string;
  email?: string;
  displayName?: string;
  disabled?: boolean;
  customClaims?: { role?: string; tenant_id?: string };
  passwordHash?: string; // base64 (scrypt) — só usado em hash_import
}

export interface MappedUser {
  legacy_uid: string;
  email: string | null;
  name: string | null;
  role: string;
  tenant_id: string | null;
  active: boolean;
  password_hash: string | null;   // null em force_reset
  must_reset_password: boolean;
}

export function mapFirebaseUser(u: FirebaseAuthUser, strategy: PasswordStrategy): MappedUser {
  const importHash = strategy === 'hash_import' && !!u.passwordHash;
  return {
    legacy_uid: u.uid,
    email: u.email ?? null,
    name: u.displayName ?? null,
    role: u.customClaims?.role ?? 'operator',
    tenant_id: u.customClaims?.tenant_id ?? null,
    active: u.disabled !== true,
    password_hash: importHash ? u.passwordHash! : null,
    must_reset_password: !importHash, // force_reset ou sem hash → precisa redefinir
  };
}
