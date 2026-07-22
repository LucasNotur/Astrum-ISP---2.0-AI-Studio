import { describe, it, expect, vi } from 'vitest';
import { validateSamlConfig, validateOidcConfig, mapSsoAttributes, handleSsoCallback, SsoConfig, SsoPorts } from './sso-saml.service';

const SSO_CONFIG: SsoConfig = {
  id: 'sso-1', tenantId: 't1', protocol: 'saml',
  entityId: 'https://isp.com/saml', ssoUrl: 'https://idp.isp.com/sso',
  certificate: 'MIIC...cert', attributeMapping: { nameID: 'externalId', mail: 'email', cn: 'displayName' },
  defaultRole: 'operator', autoProvision: true, isEnabled: true,
};

function makePorts(): SsoPorts {
  return {
    getConfig: vi.fn().mockResolvedValue(SSO_CONFIG),
    saveConfig: vi.fn().mockResolvedValue(SSO_CONFIG),
    findUserByExternalId: vi.fn().mockResolvedValue(null),
    provisionUser: vi.fn().mockResolvedValue({ id: 'u-new' }),
    createSession: vi.fn().mockResolvedValue({ token: 'jwt-123', expiresAt: '2026-07-23T10:00:00Z' }),
  };
}

describe('sso-saml.service', () => {
  describe('validateSamlConfig', () => {
    it('aceita config SAML válida', () => {
      expect(validateSamlConfig({ entityId: 'eid', ssoUrl: 'https://idp/sso', certificate: 'cert' }).valid).toBe(true);
    });
    it('rejeita sem certificado', () => {
      expect(validateSamlConfig({ entityId: 'eid', ssoUrl: 'https://idp/sso', certificate: '' }).valid).toBe(false);
    });
    it('rejeita URL sem HTTPS', () => {
      const result = validateSamlConfig({ entityId: 'eid', ssoUrl: 'http://idp/sso', certificate: 'cert' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('HTTPS');
    });
  });

  describe('validateOidcConfig', () => {
    it('aceita OIDC válido', () => {
      expect(validateOidcConfig({ ssoUrl: 'https://idp', clientId: 'cid', clientSecret: 'secret' }).valid).toBe(true);
    });
    it('rejeita sem clientId', () => {
      expect(validateOidcConfig({ ssoUrl: 'https://idp', clientId: '', clientSecret: 's' }).valid).toBe(false);
    });
  });

  describe('mapSsoAttributes', () => {
    it('mapeia atributos SAML para user', () => {
      const user = mapSsoAttributes(
        { nameID: 'ext-123', mail: 'joao@isp.com', cn: 'João Silva' },
        SSO_CONFIG.attributeMapping,
      );
      expect(user.externalId).toBe('ext-123');
      expect(user.email).toBe('joao@isp.com');
      expect(user.displayName).toBe('João Silva');
    });

    it('fallback para atributos padrão', () => {
      const user = mapSsoAttributes({ sub: 'sub-1', email: 'x@x.com', name: 'X' }, {});
      expect(user.externalId).toBe('sub-1');
      expect(user.email).toBe('x@x.com');
    });
  });

  describe('handleSsoCallback', () => {
    it('provisiona e cria sessão para novo usuário', async () => {
      const ports = makePorts();
      const result = await handleSsoCallback('t1', { nameID: 'ext-1', mail: 'j@isp.com', cn: 'J' }, ports);
      expect(result.ok).toBe(true);
      expect(result.token).toBe('jwt-123');
      expect(ports.provisionUser).toHaveBeenCalled();
    });

    it('login de usuário existente', async () => {
      const ports = makePorts();
      (ports.findUserByExternalId as any).mockResolvedValue({ id: 'u-exist', role: 'admin' });
      const result = await handleSsoCallback('t1', { nameID: 'ext-1', mail: 'j@isp.com', cn: 'J' }, ports);
      expect(result.ok).toBe(true);
      expect(ports.provisionUser).not.toHaveBeenCalled();
    });

    it('rejeita sem email', async () => {
      const ports = makePorts();
      const result = await handleSsoCallback('t1', { nameID: 'ext-1', cn: 'J' }, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('email');
    });

    it('rejeita auto-provisão desabilitada', async () => {
      const ports = makePorts();
      (ports.getConfig as any).mockResolvedValue({ ...SSO_CONFIG, autoProvision: false });
      const result = await handleSsoCallback('t1', { nameID: 'ext-1', mail: 'j@isp.com' }, ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('auto-provisão');
    });

    it('rejeita SSO desabilitado', async () => {
      const ports = makePorts();
      (ports.getConfig as any).mockResolvedValue({ ...SSO_CONFIG, isEnabled: false });
      const result = await handleSsoCallback('t1', { nameID: 'ext-1', mail: 'j@isp.com' }, ports);
      expect(result.ok).toBe(false);
    });
  });
});
