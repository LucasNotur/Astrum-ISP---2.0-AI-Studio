import { securityLogger } from '../logging/logger';

/**
 * PII Detector — detecta e mascara dados pessoais sensíveis.
 *
 * Padrões detectados (contexto Brasil):
 * - CPF: 000.000.000-00 ou 00000000000
 * - RG: 00.000.000-0
 * - Cartão de crédito: 16 dígitos (com ou sem espaços)
 * - Telefone: (11) 99999-9999 ou 11999999999
 * - Email
 * - Chave PIX (CPF, email, telefone, chave aleatória)
 * - Senha (padrões como "minha senha é X", "password: X")
 *
 * FILOSOFIA: Mascarar, não bloquear.
 * A mensagem chega ao LLM, mas sem dados que não devemos armazenar.
 */

export interface PIIDetectionResult {
  originalText: string;
  maskedText: string;
  detected: PIIEntity[];
  hasPII: boolean;
}

export interface PIIEntity {
  type: PIIType;
  originalValue: string;
  maskedValue: string;
  startIndex: number;
  endIndex: number;
}

export type PIIType =
  | 'CPF'
  | 'RG'
  | 'CREDIT_CARD'
  | 'PHONE'
  | 'EMAIL'
  | 'PIX_KEY'
  | 'PASSWORD_MENTION'
  | 'BANK_ACCOUNT';

const PII_PATTERNS: Array<{ type: PIIType; pattern: RegExp; mask: string }> = [
  {
    type: 'CPF',
    pattern: /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g,
    mask: '[CPF OMITIDO]',
  },
  {
    type: 'CREDIT_CARD',
    pattern: /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g,
    mask: '[CARTÃO OMITIDO]',
  },
  {
    type: 'PHONE',
    pattern: /\b(\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4})\b/g,
    mask: '[TELEFONE OMITIDO]',
  },
  {
    type: 'EMAIL',
    pattern: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    mask: '[EMAIL OMITIDO]',
  },
  {
    type: 'RG',
    pattern: /\b(\d{2}\.?\d{3}\.?\d{3}-?[\dxX])\b/g,
    mask: '[RG OMITIDO]',
  },
  {
    type: 'PASSWORD_MENTION',
    pattern: /\b(senha|password|passwd|pin)\s*[:=é]\s*\S+/gi,
    mask: '[SENHA OMITIDA]',
  },
  {
    type: 'BANK_ACCOUNT',
    pattern: /\bagência\s*[:=]?\s*\d{4}[-\s]?\d?\s*conta\s*[:=]?\s*\d{5,12}/gi,
    mask: '[DADOS BANCÁRIOS OMITIDOS]',
  },
];

const SPOKEN_DIGITS: Record<string, string> = {
  zero: '0', um: '1', uma: '1', dois: '2', duas: '2', três: '3', tres: '3',
  quatro: '4', cinco: '5', meia: '6', seis: '6', sete: '7', oito: '8', nove: '9',
};

export function spokenNumbersToDigits(text: string): string {
  const words = Object.keys(SPOKEN_DIGITS).join('|');
  const re = new RegExp(`\\b(${words})\\b`, 'gi');
  const converted = text.replace(re, (match) => SPOKEN_DIGITS[match.toLowerCase()] ?? match);
  // Collapse sequences of single digits separated by spaces: "1 2 3" → "123"
  return converted.replace(/\b(\d(?:\s+\d)+)\b/g, (m) => m.replace(/\s+/g, ''));
}

export interface DetectOptions {
  spoken?: boolean;
}

export function detectAndMaskPII(text: string, opts?: DetectOptions): PIIDetectionResult {
  const normalizedText = opts?.spoken ? spokenNumbersToDigits(text) : text;
  const detected: PIIEntity[] = [];
  let maskedText = normalizedText;
  let offset = 0;

  for (const { type, pattern, mask } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(normalizedText)) !== null) {
      detected.push({
        type,
        originalValue: match[0],
        maskedValue: mask,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }

  // Aplicar máscaras do final para o início (para não quebrar índices)
  const sortedDetected = [...detected].sort((a, b) => b.startIndex - a.startIndex);

  for (const entity of sortedDetected) {
    maskedText =
      maskedText.slice(0, entity.startIndex) +
      entity.maskedValue +
      maskedText.slice(entity.endIndex);
  }

  const hasPII = detected.length > 0;

  if (hasPII) {
    securityLogger.info(
      { piiTypes: detected.map(d => d.type), count: detected.length },
      'PII detectado e mascarado na mensagem antes de enviar para LLM'
    );
  }

  return { originalText: text, maskedText, detected, hasPII };
}

/**
 * Versão simplificada — retorna apenas o texto mascarado.
 */
export function maskPII(text: string, opts?: DetectOptions): string {
  return detectAndMaskPII(text, opts).maskedText;
}
