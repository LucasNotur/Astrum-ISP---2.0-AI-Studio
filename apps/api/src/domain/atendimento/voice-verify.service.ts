import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { IVoiceVerifyPort, nullVoiceVerify } from './voice-verify.port';

let _port: IVoiceVerifyPort = nullVoiceVerify;

export function setVoiceVerifyPort(port: IVoiceVerifyPort) {
  _port = port;
}

export function getVoiceVerifyPort(): IVoiceVerifyPort {
  return _port;
}

export async function hasConsent(customerId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('voice_biometry_consents')
    .select('customer_id, revoked_at')
    .eq('customer_id', customerId)
    .maybeSingle();

  return !!data && !data.revoked_at;
}

export async function grantConsent(
  customerId: string,
  tenantId: string,
  channel: string = 'voice',
): Promise<void> {
  await supabaseAdmin
    .from('voice_biometry_consents')
    .upsert({
      customer_id: customerId,
      tenant_id: tenantId,
      consented_at: new Date().toISOString(),
      consent_channel: channel,
      revoked_at: null,
    });
}

export async function revokeConsent(customerId: string): Promise<void> {
  await supabaseAdmin
    .from('voice_biometry_consents')
    .update({ revoked_at: new Date().toISOString() })
    .eq('customer_id', customerId);

  // LGPD art. 18: apagar voice_prints imediatamente
  await supabaseAdmin
    .from('voice_prints')
    .delete()
    .eq('customer_id', customerId);
}

export async function verifyOrChallenge(
  callId: string,
  customerId: string,
): Promise<{ method: 'biometric' | 'challenge'; verified: boolean; confidence?: number }> {
  const consented = await hasConsent(customerId);
  if (!consented) {
    return { method: 'challenge', verified: false };
  }

  const result = await _port.verify(callId, customerId);
  if (result === 'unavailable') {
    return { method: 'challenge', verified: false };
  }

  return { method: 'biometric', verified: result.verified, confidence: result.confidence };
}
