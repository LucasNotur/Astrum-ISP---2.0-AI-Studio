import { describe, it, expect } from 'vitest';
import {
  ulawToPcm16,
  ulawBufferToPcm16,
  pcm16ToUlawsample,
  pcm16ToUlawsamples,
  resample8kTo24k,
  resample24kTo8k,
  twilioAudioToPcm24k,
  pcm24kToTwilioAudio,
  pcm16ToBase64,
  base64ToPcm16,
} from './ulaw-converter';

describe('ulaw-converter', () => {
  it('silêncio μ-law (0xff e 0x7f) decodifica para 0', () => {
    expect(ulawToPcm16(0xff)).toBe(0);
    expect(ulawToPcm16(0x7f)).toBe(0);
  });

  it('bytes conhecidos da tabela G.711 têm ordem de grandeza correta', () => {
    // Extremos da tabela μ-law: valores máximos de magnitude (sinais opostos).
    expect(ulawToPcm16(0x00)).toBeLessThan(-32000);
    expect(ulawToPcm16(0x80)).toBeGreaterThan(32000);
  });

  it('decodifica buffer μ-law', () => {
    const buffer = Buffer.from([0xff, 0xff, 0xff]);
    const pcm = ulawBufferToPcm16(buffer);
    expect(pcm).toHaveLength(3);
    expect(pcm[0]).toBe(0);
    expect(pcm[1]).toBe(0);
    expect(pcm[2]).toBe(0);
  });

  it('codifica/decodifica PCM16 com erro pequeno', () => {
    const samples = new Int16Array([0, 1000, -1000, 16000, -16000, 32767, -32768]);
    const roundTrips = Array.from(samples).map(s => {
      const u = pcm16ToUlawsample(s);
      return ulawToPcm16(u);
    });
    for (let i = 0; i < samples.length; i++) {
      expect(Math.abs(roundTrips[i]! - samples[i]!)).toBeLessThanOrEqual(1024);
    }
  });

  it('codifica Int16Array para base64 μ-law', () => {
    const samples = new Int16Array([0, 1000, -1000]);
    const b64 = pcm16ToUlawsamples(samples);
    const decoded = Buffer.from(b64, 'base64');
    expect(decoded).toHaveLength(3);
  });

  it('resample 8k→24k triplica amostras', () => {
    const input = new Int16Array([0, 100, 200]);
    const output = resample8kTo24k(input);
    expect(output).toHaveLength(9);
    expect(output[0]).toBe(0);
    expect(output[3]).toBe(100);
    expect(output[6]).toBe(200);
  });

  it('resample 24k→8k reduz para 1/3', () => {
    const input = new Int16Array([0, 33, 66, 100, 133, 166]);
    const output = resample24kTo8k(input);
    expect(output).toHaveLength(2);
    expect(output[0]).toBe(0);
    expect(output[1]).toBe(100);
  });

  it('round-trip Twilio ↔ OpenAI preserva silêncio', () => {
    const silence = Buffer.alloc(120, 0xff).toString('base64');
    const pcm24k = twilioAudioToPcm24k(silence);
    const pcm = base64ToPcm16(pcm24k);
    expect(pcm.every(s => s === 0)).toBe(true);

    const backToTwilio = pcm24kToTwilioAudio(pcm24k);
    const backBuffer = Buffer.from(backToTwilio, 'base64');
    // Tanto 0x7f quanto 0xff decodificam para 0 (silêncio μ-law).
    expect(backBuffer.every(b => ulawToPcm16(b) === 0)).toBe(true);
  });

  it('round-trip de tom simples mantém sinal', () => {
    const tone8k = new Int16Array(80);
    for (let i = 0; i < tone8k.length; i++) {
      tone8k[i] = Math.round(Math.sin((i / 80) * Math.PI * 2) * 5000);
    }
    const pcm24k = pcm16ToBase64(resample8kTo24k(tone8k));
    const twilioBack = pcm24kToTwilioAudio(pcm24k);
    const pcmBack = ulawBufferToPcm16(Buffer.from(twilioBack, 'base64'));

    let sameSign = 0;
    for (let i = 0; i < Math.min(tone8k.length, pcmBack.length); i++) {
      if (Math.sign(tone8k[i]!) === Math.sign(pcmBack[i]!)) sameSign++;
    }
    expect(sameSign / tone8k.length).toBeGreaterThan(0.85);
  });
});
