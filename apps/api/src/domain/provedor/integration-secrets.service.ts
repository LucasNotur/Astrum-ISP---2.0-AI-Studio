import { encryptString, looksEncrypted } from '../../adapters/erp/credential-cipher';

const SECRET_FIELDS = ['openaiApiKey', 'evolutionApiKey'] as const;
type SecretField = (typeof SECRET_FIELDS)[number];

/**
 * Mescla `incoming` no `existing` (mesma semântica do saveIntegrationKeys atual:
 * spread por cima). Para os 2 campos secretos, cifra o valor recebido (se não-vazio e
 * ainda não cifrado — idempotente, evita cifrar 2x um valor que já veio cifrado por
 * engano). Todo o resto passa direto, sem tocar.
 */
export function mergeAndEncryptIntegrationKeys(
  existing: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  const merged = { ...existing, ...incoming };
  for (const field of SECRET_FIELDS) {
    const value = incoming[field];
    if (value && !looksEncrypted(value)) {
      merged[field] = encryptString(value);
    }
  }
  return merged;
}

/** Status sem vazar segredo: só diz se cada campo está configurado. */
export function computeSecretsStatus(stored: Record<string, string>): Record<SecretField, boolean> {
  return {
    openaiApiKey: !!stored.openaiApiKey,
    evolutionApiKey: !!stored.evolutionApiKey,
  };
}
