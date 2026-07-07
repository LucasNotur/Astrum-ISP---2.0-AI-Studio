/**
 * IA-08 A2 — Conversores de áudio Twilio ↔ OpenAI Realtime.
 *
 * Twilio Media Streams: μ-law (u-law) 8 kHz, mono, payload base64.
 * OpenAI Realtime: PCM16 little-endian 24 kHz, mono, payload base64.
 *
 * Implementação pura em TypeScript (aproximação G.711), sem dependências nativas.
 */

/**
 * Decodifica um byte μ-law para PCM16.
 * Aproximação da tabela ITU-T G.711; os códigos 0x7f e 0xff (silêncio) mapeiam para 0.
 */
export function ulawToPcm16(ulawByte: number): number {
  const u = ~ulawByte & 0xff;
  const sign = (u & 0x80) ? -1 : 1;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;

  // Código 0 (após inversão) = silêncio absoluto.
  if (exponent === 0 && mantissa === 0) return 0;

  const magnitude = exponent === 0
    ? (mantissa << 4)
    : ((mantissa << 3) + 0x84) << exponent;

  return sign * magnitude;
}

/** Tabela de decodificação μ-law → PCM16 (256 entradas). */
const ULAW_TO_PCM16: Int16Array = (() => {
  const table = new Int16Array(256);
  for (let i = 0; i < 256; i++) table[i] = ulawToPcm16(i);
  return table;
})();

/** Decodifica um buffer de bytes μ-law para Int16Array PCM16. */
export function ulawBufferToPcm16(buffer: Buffer): Int16Array {
  const samples = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    samples[i] = ULAW_TO_PCM16[buffer[i]!] ?? 0;
  }
  return samples;
}

/** Codifica uma amostra PCM16 para byte μ-law via busca na tabela de decodificação. */
export function pcm16ToUlawsample(sample: number): number {
  const clamped = Math.max(-32768, Math.min(32767, sample));
  let best = 0x7f;
  let bestErr = Math.abs(ULAW_TO_PCM16[best]! - clamped);

  // Busca linear na tabela pequena (256 entradas) — rápido o suficiente para voz.
  for (let u = 0; u < 256; u++) {
    const err = Math.abs(ULAW_TO_PCM16[u]! - clamped);
    if (err < bestErr) {
      bestErr = err;
      best = u;
    }
  }
  return best;
}

/** Codifica um Int16Array PCM16 para buffer de bytes μ-law. */
export function pcm16BufferToUlawsamples(samples: Int16Array): Buffer {
  const out = Buffer.alloc(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = pcm16ToUlawsample(samples[i]!);
  }
  return out;
}

/** Codifica um Int16Array PCM16 para base64 μ-law. */
export function pcm16ToUlawsamples(samples: Int16Array): string {
  return pcm16BufferToUlawsamples(samples).toString('base64');
}

/**
 * Reamostragem linear simples de 8 kHz → 24 kHz (ratio 3).
 * Suficiente para voz telefônica no MVP.
 */
export function resample8kTo24k(samples: Int16Array): Int16Array {
  const ratio = 3;
  const output = new Int16Array(samples.length * ratio);
  for (let i = 0; i < samples.length; i++) {
    const base = i * ratio;
    const current = samples[i]!;
    output[base] = current;
    if (i + 1 < samples.length) {
      const next = samples[i + 1]!;
      const step = (next - current) / ratio;
      for (let j = 1; j < ratio; j++) {
        output[base + j] = Math.round(current + step * j);
      }
    } else {
      for (let j = 1; j < ratio; j++) output[base + j] = current;
    }
  }
  return output;
}

/**
 * Reamostragem linear simples de 24 kHz → 8 kHz (ratio 1/3).
 * Suficiente para voz telefônica no MVP.
 */
export function resample24kTo8k(samples: Int16Array): Int16Array {
  const ratio = 3;
  const outLen = Math.floor(samples.length / ratio);
  const output = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    output[i] = samples[i * ratio]!;
  }
  return output;
}

/** Twilio μ-law base64 → OpenAI PCM16 24kHz base64. */
export function twilioAudioToPcm24k(base64Audio: string): string {
  const buffer = Buffer.from(base64Audio, 'base64');
  const pcm8k = ulawBufferToPcm16(buffer);
  const pcm24k = resample8kTo24k(pcm8k);
  return pcm16ToBase64(pcm24k);
}

/** OpenAI PCM16 24kHz base64 → Twilio μ-law 8kHz base64. */
export function pcm24kToTwilioAudio(base64Audio: string): string {
  const pcm24k = base64ToPcm16(base64Audio);
  const pcm8k = resample24kTo8k(pcm24k);
  return pcm16ToUlawsamples(pcm8k);
}

/** Codifica Int16Array para base64 PCM16 little-endian. */
export function pcm16ToBase64(samples: Int16Array): string {
  const buffer = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i]!, i * 2);
  }
  return buffer.toString('base64');
}

/** Decodifica base64 PCM16 little-endian para Int16Array. */
export function base64ToPcm16(base64: string): Int16Array {
  const buffer = Buffer.from(base64, 'base64');
  const samples = new Int16Array(buffer.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = buffer.readInt16LE(i * 2);
  }
  return samples;
}
