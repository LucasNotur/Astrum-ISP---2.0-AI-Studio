/**
 * Fase 3 — port de `src/routes/hsmTemplates.ts` (nunca montado em `server.ts`,
 * bug pré-existente inventariado no PLANO_MIGRACAO_EXPRESS_FASTIFY.md §5) para
 * `POST/GET/DELETE /api/v2/hsm-templates`.
 *
 * O shape abaixo é o que `src/pages/WhatsAppPage.tsx` (aba "Templates HSM") já
 * envia hoje (`name/category/language/header_type/header_content/body/footer`)
 * — o router legado esperava `components`, campo que o front nunca mandava; os
 * dois nunca se encontraram. `src/lib/whatsappSender.ts` (envio real via
 * Evolution) lê `template.body`, então este é o contrato que faz o envio
 * funcionar de ponta a ponta.
 *
 * Lógica pura, sem I/O — a rota Fastify só faz auth + I/O + chama isto.
 */

export class HsmTemplateValidationError extends Error {}

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type TemplateHeaderType = 'none' | 'text' | 'image' | 'document';

const VALID_CATEGORIES: readonly TemplateCategory[] = ['MARKETING', 'UTILITY', 'AUTHENTICATION'];
const VALID_HEADER_TYPES: readonly TemplateHeaderType[] = ['none', 'text', 'image', 'document'];

export interface HsmTemplateRow {
  tenant_id: string;
  name: string;
  category: TemplateCategory;
  language: string;
  header_type: TemplateHeaderType;
  header_content: string | null;
  body: string;
  footer: string | null;
  status: 'PENDING';
}

/** Monta a linha pronta pra inserir em `hsm_templates`. Valida e normaliza. Pura. */
export function buildHsmTemplateRow(tenantId: string, input: any): HsmTemplateRow {
  if (!tenantId) throw new HsmTemplateValidationError('tenant ausente');

  const name = String(input?.name ?? '').trim();
  if (!name) throw new HsmTemplateValidationError('name é obrigatório');

  const body = String(input?.body ?? '').trim();
  if (!body) throw new HsmTemplateValidationError('body é obrigatório');

  const category = (VALID_CATEGORIES as string[]).includes(input?.category) ? input.category : 'MARKETING';
  const headerType = (VALID_HEADER_TYPES as string[]).includes(input?.header_type) ? input.header_type : 'none';

  return {
    tenant_id: tenantId,
    name,
    category,
    language: input?.language ? String(input.language) : 'pt_BR',
    header_type: headerType,
    // Sem cabeçalho -> nunca guarda header_content, mesmo se o caller mandar (higiene de dado).
    header_content: headerType === 'none' ? null : (input?.header_content ? String(input.header_content) : null),
    body,
    footer: input?.footer ? String(input.footer) : null,
    status: 'PENDING',
  };
}

/** Regra portada do legado: template já aprovado pela Meta não pode ser excluído direto. Pura. */
export function canDeleteTemplate(status: string | null | undefined): boolean {
  return status !== 'APPROVED';
}
