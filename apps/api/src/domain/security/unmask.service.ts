import { createHash } from 'node:crypto';

/**
 * Auditoria de reveal de PII (MaskedSensitiveData → "Acesso a Dados Sensíveis").
 * Funções PURAS; a rota grava o audit_log e ecoa o valor.
 *
 * ⚠️ Contexto de design (verificado): a máscara é COSMÉTICA e client-side — o
 * componente já recebe o valor CRU como prop e mascara no browser (maskCPF, etc.).
 * Logo o endpoint NÃO protege dado (o browser já tem tudo); o valor real é a
 * TRILHA DE AUDITORIA (LGPD): registrar quem revelou PII, de que tipo e por quê.
 *
 * Por isso o audit NÃO guarda o PII cru (duplicá-lo criaria outro repositório de
 * dado sensível). Guarda: `type`, `reason`, um `value_hash` (correlaciona acessos
 * ao mesmo dado sem revelá-lo) e um `hint` curto (últimos 2 chars).
 */

const TYPES = new Set(['cpf', 'phone', 'email']);
const MAX_REASON = 200;

export class UnmaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnmaskValidationError';
  }
}

export interface UnmaskAudit {
  resource: string;
  metadata: { type: string; reason: string; value_hash: string; hint: string };
}

export function buildUnmaskAudit(input: { value: unknown; type: unknown; reason: unknown }): UnmaskAudit {
  const value = typeof input.value === 'string' ? input.value : '';
  if (!value) throw new UnmaskValidationError('Valor ausente.');

  if (typeof input.type !== 'string' || !TYPES.has(input.type)) {
    throw new UnmaskValidationError('Tipo de dado inválido (esperado cpf, phone ou email).');
  }
  const type = input.type;

  const reason = String(input.reason ?? '').trim();
  if (reason.length < 3) throw new UnmaskValidationError('Motivo obrigatório para revelar dado sensível.');
  if (reason.length > MAX_REASON) throw new UnmaskValidationError(`Motivo não pode exceder ${MAX_REASON} caracteres.`);

  const value_hash = createHash('sha256').update(value).digest('hex').slice(0, 16);
  const hint = value.length >= 2 ? value.slice(-2) : '';

  return { resource: type, metadata: { type, reason, value_hash, hint } };
}
