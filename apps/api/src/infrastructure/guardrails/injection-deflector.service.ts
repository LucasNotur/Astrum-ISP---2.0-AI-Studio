import { securityLogger } from '../logging/logger';

/**
 * Injection Deflector — detecta tentativas de prompt injection e jailbreak.
 *
 * CAMADAS DE DEFESA:
 * 1. Regex patterns (rápido, sem custo de API)
 * 2. Heurísticas de comportamento suspeito
 * 3. Score de risco acumulado (múltiplos sinais fracos = bloqueio)
 *
 * Threshold configurável por tenant em ai_configurations.security_threshold
 */

export interface InjectionAnalysis {
  isSafe: boolean;
  riskScore: number;        // 0.0 (seguro) → 1.0 (injeção confirmada)
  detectedPatterns: string[];
  recommendation: 'allow' | 'warn' | 'block';
  reason?: string;
}

interface InjectionPattern {
  name: string;
  pattern: RegExp;
  weight: number; // contribuição para o riskScore
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  // Comandos diretos de override
  {
    name: 'ignore_instructions',
    pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
    weight: 0.9,
  },
  {
    name: 'forget_instructions',
    pattern: /forget\s+(everything|all|your\s+instructions)/gi,
    weight: 0.9,
  },
  {
    name: 'new_instructions',
    pattern: /your\s+new\s+(instructions?|prompt|rules?|task)\s*(are|is)?[:=]/gi,
    weight: 0.8,
  },

  // Tentativas em português
  {
    name: 'ignore_instructions_pt',
    pattern: /ignore\s+(todas?\s+as?\s+)?(instruções|regras|comandos)\s+(anteriores?|acima)/gi,
    weight: 0.9,
  },
  {
    name: 'act_as_pt',
    pattern: /aja\s+como\s+(se\s+você\s+fosse|um|uma)\s+/gi,
    weight: 0.6,
  },
  {
    name: 'admin_access_pt',
    pattern: /(me\s+dê\s+acesso|libere\s+o\s+acesso|acesso\s+(admin|root|total))/gi,
    weight: 0.85,
  },

  // Tentativas de roleplay malicioso
  {
    name: 'dan_jailbreak',
    pattern: /\bDAN\b|do\s+anything\s+now|jailbreak/gi,
    weight: 0.95,
  },
  {
    name: 'act_as_en',
    pattern: /act\s+as\s+(if\s+you\s+were|a|an)\s+/gi,
    weight: 0.5,
  },
  {
    name: 'pretend_en',
    pattern: /pretend\s+(you\s+are|to\s+be)\s+/gi,
    weight: 0.5,
  },

  // Exfiltração de dados do sistema
  {
    name: 'reveal_prompt',
    pattern: /(show|reveal|display|print|repeat)\s+(your\s+)?(system\s+)?(prompt|instructions)/gi,
    weight: 0.8,
  },
  {
    name: 'reveal_prompt_pt',
    pattern: /(mostre?|revele?|exiba|repita)\s+(seus?\s+|suas?\s+)?(prompt|instruções\s+do\s+sistema)/gi,
    weight: 0.8,
  },

  // Injeção via delimitadores
  {
    name: 'delimiter_injection',
    pattern: /(\[INST\]|\[\/INST\]|<\|im_start\|>|<\|im_end\|>|###\s*System:)/g,
    weight: 0.95,
  },

  // Tentativa de executar código
  {
    name: 'code_execution',
    pattern: /(execute|run|eval)\s+(this\s+)?(code|script|command)/gi,
    weight: 0.7,
  },
];

const SUSPICIOUS_BEHAVIORS = [
  // Mensagem muito longa pode ser tentativa de injection por volume
  { name: 'very_long_message', check: (text: string) => text.length > 1500, weight: 0.2 },
  // Muitas quebras de linha/espaços podem esconder injeção
  { name: 'excessive_newlines', check: (text: string) => (text.match(/\n/g)?.length ?? 0) > 20, weight: 0.15 },
  // Muitos caracteres especiais
  { name: 'special_chars', check: (text: string) => (text.match(/[{}[\]<>]/g)?.length ?? 0) > 10, weight: 0.15 },
];

export function analyzeForInjection(
  text: string,
  securityThreshold = 0.7
): InjectionAnalysis {
  const detectedPatterns: string[] = [];
  let riskScore = 0;

  // Checar padrões regex
  for (const { name, pattern, weight } of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      detectedPatterns.push(name);
      riskScore = Math.min(1.0, riskScore + weight);
    }
  }

  // Checar comportamentos suspeitos
  for (const { name, check, weight } of SUSPICIOUS_BEHAVIORS) {
    if (check(text)) {
      detectedPatterns.push(name);
      riskScore = Math.min(1.0, riskScore + weight);
    }
  }

  // Determinar recomendação baseada no score
  let recommendation: InjectionAnalysis['recommendation'];
  let reason: string | undefined;

  if (riskScore >= securityThreshold) {
    recommendation = 'block';
    reason = `Score de risco ${riskScore.toFixed(2)} excede threshold ${securityThreshold}. Padrões: ${detectedPatterns.join(', ')}`;
    securityLogger.error(
      { riskScore, detectedPatterns, textPreview: text.slice(0, 100) },
      '🚨 Tentativa de prompt injection detectada e bloqueada'
    );
  } else if (riskScore >= 0.4) {
    recommendation = 'warn';
    securityLogger.warn({ riskScore, detectedPatterns }, 'Mensagem suspeita — passando com aviso');
  } else {
    recommendation = 'allow';
  }

  return {
    isSafe: recommendation !== 'block',
    riskScore,
    detectedPatterns,
    recommendation,
    reason,
  };
}
