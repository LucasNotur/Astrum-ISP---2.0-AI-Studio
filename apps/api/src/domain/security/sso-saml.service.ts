/**
 * Dossiê #104 — Single Sign-On (SAML/OIDC/Google).
 * Gerencia configuração de SSO, validação de assertions SAML,
 * mapeamento de atributos e provisão automática de usuários.
 */

export type SsoProtocol = 'saml' | 'oidc' | 'google';

export interface SsoConfig {
  id: string;
  tenantId: string;
  protocol: SsoProtocol;
  entityId: string;
  ssoUrl: string;
  certificate?: string;
  clientId?: string;
  clientSecret?: string;
  attributeMapping: Record<string, string>;
  defaultRole: string;
  autoProvision: boolean;
  isEnabled: boolean;
}

export interface SsoUser {
  externalId: string;
  email: string;
  displayName: string;
  groups?: string[];
  attributes: Record<string, string>;
}

export interface SsoPorts {
  getConfig: (tenantId: string) => Promise<SsoConfig | null>;
  saveConfig: (config: SsoConfig) => Promise<SsoConfig>;
  findUserByExternalId: (tenantId: string, externalId: string) => Promise<{ id: string; role: string } | null>;
  provisionUser: (tenantId: string, user: SsoUser, role: string) => Promise<{ id: string }>;
  createSession: (tenantId: string, userId: string) => Promise<{ token: string; expiresAt: string }>;
}

export function validateSamlConfig(config: Pick<SsoConfig, 'entityId' | 'ssoUrl' | 'certificate'>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config.entityId) errors.push('Entity ID obrigatório');
  if (!config.ssoUrl) errors.push('SSO URL obrigatória');
  if (!config.certificate) errors.push('Certificado X.509 obrigatório para SAML');
  if (config.ssoUrl && !config.ssoUrl.startsWith('https://')) errors.push('SSO URL deve usar HTTPS');
  return { valid: errors.length === 0, errors };
}

export function validateOidcConfig(config: Pick<SsoConfig, 'ssoUrl' | 'clientId' | 'clientSecret'>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config.ssoUrl) errors.push('Discovery URL obrigatória');
  if (!config.clientId) errors.push('Client ID obrigatório');
  if (!config.clientSecret) errors.push('Client Secret obrigatório');
  return { valid: errors.length === 0, errors };
}

export function mapSsoAttributes(rawAttributes: Record<string, string>, mapping: Record<string, string>): SsoUser {
  const mapped: Record<string, string> = {};
  for (const [ssoAttr, localAttr] of Object.entries(mapping)) {
    if (rawAttributes[ssoAttr]) mapped[localAttr] = rawAttributes[ssoAttr];
  }

  return {
    externalId: mapped.externalId ?? rawAttributes.nameID ?? rawAttributes.sub ?? '',
    email: mapped.email ?? rawAttributes.email ?? '',
    displayName: mapped.displayName ?? rawAttributes.displayName ?? rawAttributes.name ?? '',
    attributes: mapped,
  };
}

export async function handleSsoCallback(
  tenantId: string,
  rawAttributes: Record<string, string>,
  ports: SsoPorts,
): Promise<{ ok: boolean; token?: string; userId?: string; error?: string }> {
  const config = await ports.getConfig(tenantId);
  if (!config || !config.isEnabled) return { ok: false, error: 'SSO não configurado ou desabilitado' };

  const user = mapSsoAttributes(rawAttributes, config.attributeMapping);
  if (!user.email) return { ok: false, error: 'Atributo email não encontrado na resposta SSO' };
  if (!user.externalId) return { ok: false, error: 'Identificador externo não encontrado' };

  let existingUser = await ports.findUserByExternalId(tenantId, user.externalId);

  if (!existingUser) {
    if (!config.autoProvision) {
      return { ok: false, error: 'Usuário não encontrado e auto-provisão desabilitada' };
    }
    const { id } = await ports.provisionUser(tenantId, user, config.defaultRole);
    existingUser = { id, role: config.defaultRole };
  }

  const session = await ports.createSession(tenantId, existingUser.id);
  return { ok: true, token: session.token, userId: existingUser.id };
}
