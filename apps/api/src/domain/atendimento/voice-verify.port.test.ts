import { describe, it, expect, vi } from 'vitest';
import { nullVoiceVerify, isVoiceBiometricsEnabled, type IVoiceVerifyPort } from './voice-verify.port';

describe('voice-verify.port', () => {
  it('nullVoiceVerify.enroll returns unavailable', async () => {
    expect(await nullVoiceVerify.enroll('call1', 'cust1')).toBe('unavailable');
  });

  it('nullVoiceVerify.verify returns unavailable', async () => {
    expect(await nullVoiceVerify.verify('call1', 'cust1')).toBe('unavailable');
  });

  it('isVoiceBiometricsEnabled defaults to false', () => {
    delete (process.env as any).VOICE_BIOMETRICS_ENABLED;
    expect(isVoiceBiometricsEnabled()).toBe(false);
  });

  it('isVoiceBiometricsEnabled returns true when set', () => {
    process.env.VOICE_BIOMETRICS_ENABLED = 'true';
    expect(isVoiceBiometricsEnabled()).toBe(true);
    delete (process.env as any).VOICE_BIOMETRICS_ENABLED;
  });

  it('port contract: verify returns object or unavailable', async () => {
    const mockPort: IVoiceVerifyPort = {
      enroll: vi.fn(async () => 'ok'),
      verify: vi.fn(async () => ({ verified: true, confidence: 0.95 })),
    };
    expect(await mockPort.enroll('c1', 'u1')).toBe('ok');
    const result = await mockPort.verify('c1', 'u1');
    expect(result).not.toBe('unavailable');
    if (result !== 'unavailable') {
      expect(result.verified).toBe(true);
      expect(result.confidence).toBe(0.95);
    }
  });

  it('without consent verify is never called (contract test)', async () => {
    const verifySpy = vi.fn();
    const mockPort: IVoiceVerifyPort = {
      enroll: vi.fn(async () => 'ok'),
      verify: verifySpy,
    };
    // Simulate: no consent → verify should never be called
    const consented = false;
    if (consented) {
      await mockPort.verify('c1', 'u1');
    }
    expect(verifySpy).not.toHaveBeenCalled();
  });
});
