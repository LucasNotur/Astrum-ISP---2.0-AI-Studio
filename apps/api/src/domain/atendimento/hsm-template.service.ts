/**
 * Dossiê #53 — Disparo ativo API Oficial (HSM, Templates META).
 * Gerencia templates HSM aprovados pelo WhatsApp Business API,
 * permite criar, submeter para aprovação e disparar proativamente.
 */

export type TemplateStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type TemplateCategory = 'marketing' | 'utility' | 'authentication';

export interface HsmTemplate {
  id: string;
  tenantId: string;
  name: string;
  language: string;
  category: TemplateCategory;
  headerText?: string;
  bodyText: string;
  footerText?: string;
  buttons?: Array<{ type: 'url' | 'phone' | 'quick_reply'; text: string; value?: string }>;
  status: TemplateStatus;
  metaTemplateId?: string;
  variables: string[];
  createdAt: string;
}

export interface HsmPorts {
  listTemplates: (tenantId: string) => Promise<HsmTemplate[]>;
  createTemplate: (tenantId: string, template: Omit<HsmTemplate, 'id' | 'tenantId' | 'status' | 'metaTemplateId' | 'createdAt'>) => Promise<HsmTemplate>;
  submitForApproval: (tenantId: string, templateId: string) => Promise<{ success: boolean; metaTemplateId?: string; error?: string }>;
  sendHsm: (tenantId: string, templateId: string, phone: string, variables: Record<string, string>) => Promise<{ messageId: string }>;
}

export function extractVariables(bodyText: string): string[] {
  const matches = bodyText.match(/\{\{\d+\}\}/g) ?? [];
  return [...new Set(matches)].sort();
}

export function renderTemplate(bodyText: string, variables: Record<string, string>): string {
  let result = bodyText;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

export function validateTemplate(template: Pick<HsmTemplate, 'bodyText' | 'category' | 'buttons'>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!template.bodyText || template.bodyText.length < 10) {
    errors.push('Corpo do template deve ter pelo menos 10 caracteres');
  }
  if (template.bodyText.length > 1024) {
    errors.push('Corpo do template não pode exceder 1024 caracteres');
  }
  if (template.buttons && template.buttons.length > 3) {
    errors.push('Máximo de 3 botões por template');
  }
  if (template.category === 'marketing' && !template.bodyText.includes('{{')) {
    errors.push('Templates marketing devem ter pelo menos uma variável de personalização');
  }

  return { valid: errors.length === 0, errors };
}

export async function sendProactiveMessage(
  tenantId: string,
  templateId: string,
  phone: string,
  variables: Record<string, string>,
  ports: HsmPorts,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const templates = await ports.listTemplates(tenantId);
  const template = templates.find((t) => t.id === templateId);

  if (!template) return { ok: false, error: 'Template não encontrado' };
  if (template.status !== 'approved') return { ok: false, error: `Template em status "${template.status}" — precisa estar aprovado` };

  try {
    const { messageId } = await ports.sendHsm(tenantId, templateId, phone, variables);
    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
