import { detectAndMaskPII } from './pii-detector.service';
import { analyzeForInjection } from './injection-deflector.service';
import { moderateContent } from './content-moderation.service';
import { securityLogger } from '../logging/logger';

export interface GuardrailsConfig {
  tenantId: string;
  securityThreshold?: number;
  skipModeration?: boolean; // para testes ou planos básicos
}

export interface GuardrailsResult {
  safe: boolean;
  processedText: string;   // texto após PII masking
  blockedReason?: string;
  pii: { detected: boolean; count: number };
  injection: { score: number; patterns: string[] };
  moderation: { flagged: boolean; category?: string };
  totalLatencyMs: number;
}

const BLOCK_RESPONSE = 'Não posso processar esta mensagem. Se precisar de ajuda, entre em contato com nossa equipe de suporte.';

/**
 * Pipeline completo de guardrails — executa as 3 camadas em sequência.
 *
 * ORDEM:
 * 1. PII Detection (síncrono, sem custo)
 * 2. Injection Deflection (síncrono, sem custo)
 * 3. Content Moderation (assíncrono, sem custo — API OpenAI gratuita)
 *
 * Fail-fast: se qualquer camada bloquear, não executa as seguintes.
 */
export async function runGuardrails(
  text: string,
  config: GuardrailsConfig
): Promise<GuardrailsResult> {
  const t0 = Date.now();

  // CAMADA 1: PII Detection
  const piiResult = detectAndMaskPII(text);
  const t1 = Date.now();

  // CAMADA 2: Injection Detection (no texto já mascarado)
  const injectionResult = analyzeForInjection(
    piiResult.maskedText,
    config.securityThreshold ?? 0.7
  );
  const t2 = Date.now();

  if (!injectionResult.isSafe) {
    securityLogger.info({
      piiMs: t1 - t0,
      injectionMs: t2 - t1,
      moderationMs: 0,
      totalMs: t2 - t0,
    }, 'Guardrails latency breakdown');
    
    return {
      safe: false,
      processedText: piiResult.maskedText,
      blockedReason: `Injection detectada: ${injectionResult.detectedPatterns.join(', ')}`,
      pii: { detected: piiResult.hasPII, count: piiResult.detected.length },
      injection: { score: injectionResult.riskScore, patterns: injectionResult.detectedPatterns },
      moderation: { flagged: false },
      totalLatencyMs: t2 - t0,
    };
  }

  // CAMADA 3: Content Moderation (apenas se injection passou)
  let moderationResult = { isSafe: true, flagged: false, highestCategory: 'none', highestScore: 0 };

  if (!config.skipModeration) {
    const modResult = await moderateContent(piiResult.maskedText, config.tenantId);
    moderationResult = {
      isSafe: modResult.isSafe,
      flagged: modResult.flagged,
      highestCategory: modResult.highestCategory,
      highestScore: modResult.highestScore,
    };
  }
  const t3 = Date.now();

  securityLogger.info({
    piiMs: t1 - t0,
    injectionMs: t2 - t1,
    moderationMs: t3 - t2,
    totalMs: t3 - t0,
  }, 'Guardrails latency breakdown');

  const safe = moderationResult.isSafe;

  if (!safe) {
    securityLogger.warn(
      { tenantId: config.tenantId, category: moderationResult.highestCategory },
      'Mensagem bloqueada pela pipeline de guardrails (moderation)'
    );
  }

  return {
    safe,
    processedText: piiResult.maskedText,
    blockedReason: !safe
      ? `Conteúdo impróprio detectado: ${moderationResult.highestCategory}`
      : undefined,
    pii: { detected: piiResult.hasPII, count: piiResult.detected.length },
    injection: { score: injectionResult.riskScore, patterns: injectionResult.detectedPatterns },
    moderation: { flagged: moderationResult.flagged, category: moderationResult.highestCategory },
    totalLatencyMs: t3 - t0,
  };
}

export { BLOCK_RESPONSE };
