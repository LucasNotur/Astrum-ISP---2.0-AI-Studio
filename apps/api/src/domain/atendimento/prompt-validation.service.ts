/**
 * Validação de system prompts (AIConfigPage → "Validar e salvar"). Função PURA.
 *
 * Antes o front batia em `/api/prompts/validate` (404) → `valid` vinha undefined
 * → o save ficava BLOQUEADO. Aqui se valida o conteúdo de forma determinística
 * (sem chamar LLM, que tornaria um endpoint de validação flaky/caro). O
 * `test_response` (preview do modelo) fica como melhoria futura — o front já
 * trata sua ausência (é opcional).
 */

export interface PromptValidationResult {
  valid: boolean;
  errors: string[];
}

const MAX_PROMPT_CHARS = 8000;

/**
 * Regras: não-vazio, tamanho máximo e placeholders `{{...}}` balanceados.
 * `agent` é o alvo do prompt (triage/sales/…); mantido para futuras regras
 * por-agente, mas hoje não altera o veredito.
 */
export function validatePrompt(content: unknown, _agent?: unknown): PromptValidationResult {
  const errors: string[] = [];
  const text = typeof content === 'string' ? content : '';

  if (!text.trim()) {
    errors.push('O prompt não pode ser vazio.');
  }
  if (text.length > MAX_PROMPT_CHARS) {
    errors.push(`O prompt não pode exceder ${MAX_PROMPT_CHARS} caracteres.`);
  }

  const opens = (text.match(/\{\{/g) ?? []).length;
  const closes = (text.match(/\}\}/g) ?? []).length;
  if (opens !== closes) {
    errors.push('Placeholders {{...}} desbalanceados.');
  }

  return { valid: errors.length === 0, errors };
}
