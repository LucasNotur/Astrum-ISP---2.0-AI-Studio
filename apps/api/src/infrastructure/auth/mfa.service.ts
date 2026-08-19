import { authenticator } from 'otplib';
import { encryptString, decryptString } from '../../adapters/erp/credential-cipher';
import { supabaseAdmin } from '../database/supabase.client';
import { securityLogger } from '../logging/logger';

/**
 * 2º fator (TOTP, RFC 6238) para o login próprio do apps/api.
 * Migration 107. O secret é cifrado em repouso com o mesmo ERP_CRED_KEY
 * usado para credenciais de ERP/integração (SEC-R5) — não há relação com
 * o MFA do Supabase Auth (migration 106), que cobre só o caminho RLS/legado.
 */

const ISSUER = 'Astrum';

export function generateEnrollment(email: string): { secret: string; otpauthUrl: string } {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
  return { secret, otpauthUrl };
}

export function verifyCode(secret: string, code: string): boolean {
  try {
    return authenticator.check(code, secret);
  } catch (err) {
    securityLogger.error({ err }, 'Erro ao verificar código TOTP');
    return false;
  }
}

export async function saveEnrollment(userId: string, secret: string): Promise<void> {
  const totp_secret_enc = encryptString(secret);
  const { error } = await supabaseAdmin
    .from('users')
    .update({ totp_secret_enc })
    .eq('id', userId);
  if (error) {
    securityLogger.error({ err: error, userId }, 'Erro ao salvar secret TOTP pendente');
    throw new Error('Falha ao iniciar cadastro de MFA.');
  }
}

export async function confirmEnrollment(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ totp_enabled: true, totp_verified_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    securityLogger.error({ err: error, userId }, 'Erro ao confirmar MFA');
    throw new Error('Falha ao confirmar MFA.');
  }
  securityLogger.info({ userId }, 'MFA (TOTP) habilitado');
}

export async function disableMfa(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ totp_enabled: false, totp_secret_enc: null, totp_verified_at: null })
    .eq('id', userId);
  if (error) {
    securityLogger.error({ err: error, userId }, 'Erro ao desabilitar MFA');
    throw new Error('Falha ao desabilitar MFA.');
  }
  securityLogger.warn({ userId }, 'MFA (TOTP) desabilitado');
}

export interface MfaState {
  totp_enabled: boolean;
  totp_secret_enc: string | null;
}

export async function getMfaState(userId: string): Promise<MfaState | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('totp_enabled, totp_secret_enc')
    .eq('id', userId)
    .single();
  return data ?? null;
}

/** Decifra o secret salvo — lança se totp_secret_enc estiver ausente ou a tag GCM não bater. */
export function decryptSecret(totp_secret_enc: string): string {
  return decryptString(totp_secret_enc);
}
