export interface IVoiceVerifyPort {
  enroll(callId: string, customerId: string): Promise<'ok' | 'unavailable'>;
  verify(callId: string, customerId: string): Promise<{ verified: boolean; confidence: number } | 'unavailable'>;
}

export const nullVoiceVerify: IVoiceVerifyPort = {
  async enroll() {
    return 'unavailable';
  },
  async verify() {
    return 'unavailable';
  },
};

export function isVoiceBiometricsEnabled(): boolean {
  return (process.env.VOICE_BIOMETRICS_ENABLED ?? '').trim().toLowerCase() === 'true';
}
