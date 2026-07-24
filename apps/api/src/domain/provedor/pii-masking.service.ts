/**
 * Dossiê #97 — Máscara RegEx rígida de criptografia at-rest.
 * Detecta e mascara PII sensível (CPF, CNPJ, email, telefone, cartão)
 * antes de persistir em logs, analytics e exports.
 */

export interface PiiPattern {
  name: string;
  regex: RegExp;
  mask: (match: string) => string;
}

const CPF_RE = /\b(\d{3})[.\s]?(\d{3})[.\s]?(\d{3})[.\s-]?(\d{2})\b/g;
const CNPJ_RE = /\b(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})[/\s]?(\d{4})[.\s-]?(\d{2})\b/g;
const EMAIL_RE = /\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
const PHONE_RE = /\b(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[-.\s]?\d{4}\b/g;
const CARD_RE = /\b(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})\b/g;

export const PII_PATTERNS: PiiPattern[] = [
  {
    name: 'card',
    regex: CARD_RE,
    mask: (m) => m.replace(CARD_RE, '$1 **** **** $4'),
  },
  {
    name: 'cnpj',
    regex: CNPJ_RE,
    mask: (m) => m.replace(CNPJ_RE, '$1.***.***/$4-**'),
  },
  {
    name: 'cpf',
    regex: CPF_RE,
    mask: (m) => m.replace(CPF_RE, '$1.***.***-**'),
  },
  {
    name: 'email',
    regex: EMAIL_RE,
    mask: (m) => m.replace(EMAIL_RE, (_, local: string, domain: string) =>
      `${local.slice(0, 2)}***@${domain}`),
  },
  {
    name: 'phone',
    regex: PHONE_RE,
    mask: (m) => m.replace(PHONE_RE, '(**) *****-****'),
  },
];

export function maskPii(text: string, patterns: PiiPattern[] = PII_PATTERNS): string {
  let result = text;
  for (const p of patterns) {
    result = p.mask(result);
  }
  return result;
}

export function detectPii(text: string, patterns: PiiPattern[] = PII_PATTERNS): string[] {
  const found: string[] = [];
  for (const p of patterns) {
    p.regex.lastIndex = 0;
    if (p.regex.test(text)) {
      found.push(p.name);
    }
  }
  return found;
}

export function hasPii(text: string): boolean {
  return detectPii(text).length > 0;
}
