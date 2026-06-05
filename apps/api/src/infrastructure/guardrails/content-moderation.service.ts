import { createOpenAIClient } from '../../adapters/openai/openai.adapter';
import { securityLogger } from '../logging/logger';

/**
 * Content Moderation via OpenAI Moderation API.
 *
 * API gratuita que detecta:
 * - hate / hate/threatening
 * - harassment / harassment/threatening
 * - self-harm / self-harm/intent / self-harm/instructions
 * - sexual / sexual/minors
 * - violence / violence/graphic
 *
 * Latência: ~100ms — aceitável para mensagens de atendimento.
 * Custo: ZERO (API gratuita da OpenAI).
 */

export interface ModerationResult {
  isSafe: boolean;
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
  highestScore: number;
  highestCategory: string;
  recommendation: 'allow' | 'warn' | 'block';
}

const WARN_THRESHOLD = 0.5;
const BLOCK_THRESHOLD = 0.8;

// Fallback quando a Moderation API está indisponível
const SAFE_FALLBACK: ModerationResult = {
  isSafe: true,
  flagged: false,
  categories: {},
  categoryScores: {},
  highestScore: 0,
  highestCategory: 'none',
  recommendation: 'allow',
};

export async function moderateContent(
  text: string,
  tenantId?: string
): Promise<ModerationResult> {
  const client = createOpenAIClient(tenantId);

  try {
    const response = await client.moderations.create({ input: text });
    const result = response.results[0];

    if (!result) return SAFE_FALLBACK;

    const scores = result.category_scores as Record<string, number>;
    const categories = result.categories as Record<string, boolean>;

    // Encontrar a categoria com maior score
    let highestScore = 0;
    let highestCategory = 'none';
    for (const [category, score] of Object.entries(scores)) {
      if (score > highestScore) {
        highestScore = score;
        highestCategory = category;
      }
    }

    let recommendation: ModerationResult['recommendation'];

    if (result.flagged || highestScore >= BLOCK_THRESHOLD) {
      recommendation = 'block';
      securityLogger.warn(
        { tenantId, highestCategory, highestScore: highestScore.toFixed(3), flagged: result.flagged },
        '🚨 Conteúdo impróprio detectado pela Moderation API'
      );
    } else if (highestScore >= WARN_THRESHOLD) {
      recommendation = 'warn';
      securityLogger.info(
        { tenantId, highestCategory, highestScore: highestScore.toFixed(3) },
        'Conteúdo com score moderado — passando com aviso'
      );
    } else {
      recommendation = 'allow';
    }

    return {
      isSafe: recommendation !== 'block',
      flagged: result.flagged,
      categories,
      categoryScores: scores,
      highestScore,
      highestCategory,
      recommendation,
    };
  } catch (err) {
    // Falha silenciosa — não bloquear atendimento por indisponibilidade da API
    securityLogger.error(
      { err, tenantId },
      'Moderation API indisponível — permitindo mensagem (fail open)'
    );
    return SAFE_FALLBACK;
  }
}
