/**
 * Onboarding Wizard — máquina de estados das 6 etapas de entrada de um ISP.
 * Plano Mestre V2, S91 (dossiê itens 1,2,5,10). Pura e testável; a UI consome isto.
 */

export const WIZARD_STEPS = [
  'dados_provedor',      // nome, CNPJ, contato
  'plano_saas',          // tier escolhido
  'integracao_erp',      // opcional: qual ERP + credenciais
  'whatsapp',            // criar instância Evolution
  'base_conhecimento',   // upload inicial de docs (opcional)
  'revisao',             // confirmar e ativar
] as const;

export type WizardStep = typeof WIZARD_STEPS[number];

export interface WizardState {
  completed: WizardStep[];
}

const REQUIRED_STEPS: WizardStep[] = ['dados_provedor', 'plano_saas', 'whatsapp', 'revisao'];

/** Próxima etapa pendente na ordem canônica, ou null se tudo feito. */
export function nextStep(state: WizardState): WizardStep | null {
  return WIZARD_STEPS.find((s) => !state.completed.includes(s)) ?? null;
}

/** Progresso 0–1 baseado nas etapas concluídas. */
export function wizardProgress(state: WizardState): number {
  return state.completed.length / WIZARD_STEPS.length;
}

/** O ISP só pode ser ativado quando todas as etapas OBRIGATÓRIAS estão concluídas. */
export function canActivate(state: WizardState): boolean {
  return REQUIRED_STEPS.every((s) => state.completed.includes(s));
}

/**
 * Gera o nome da instância Evolution a partir do nome do ISP (slug único).
 * Determinístico: mesmo nome+id → mesma instância (idempotência do provisionamento).
 */
export function evolutionInstanceName(ispName: string, tenantId: string): string {
  const slug = ispName
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const suffix = tenantId.replace(/-/g, '').slice(0, 8);
  return `${slug || 'isp'}-${suffix}`;
}
