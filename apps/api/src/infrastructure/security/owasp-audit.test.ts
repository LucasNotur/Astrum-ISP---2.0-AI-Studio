import { describe, it, expect, vi } from 'vitest';
import { checkPermission, type Role, type Resource, type Action } from '../auth/rbac.middleware';
import { canAccessResource, hasMinRole, planCustomerForget, type Principal } from './authz-guard';

const p = (over: Partial<Principal> = {}): Principal => ({
  userId: 'u1',
  tenantId: 't1',
  role: 'operator',
  ...over,
});

describe('OWASP A01 — Broken Access Control', () => {
  describe('IDOR prevention — todas as roles', () => {
    const roles: Principal['role'][] = ['viewer', 'operator', 'admin'];
    for (const role of roles) {
      it(`${role} NÃO acessa recurso de outro tenant`, () => {
        expect(canAccessResource(p({ role }), 't-other')).toBe(false);
      });
    }
    it('super_admin transcende tenant (suporte)', () => {
      expect(canAccessResource(p({ role: 'super_admin' }), 't-other')).toBe(true);
    });
  });

  describe('RBAC — viewer não escala', () => {
    const writableResources: Resource[] = ['tickets', 'customers', 'billing', 'ai_config', 'users', 'service_orders'];
    for (const resource of writableResources) {
      it(`viewer não pode write em ${resource}`, () => {
        expect(checkPermission('viewer', resource, 'write')).toBe(false);
      });
      it(`viewer não pode delete em ${resource}`, () => {
        expect(checkPermission('viewer', resource, 'delete')).toBe(false);
      });
    }
  });

  describe('RBAC — operator não acessa admin resources', () => {
    it('operator não acessa ai_config', () => {
      expect(checkPermission('operator', 'ai_config', 'read')).toBe(false);
      expect(checkPermission('operator', 'ai_config', 'write')).toBe(false);
    });
    it('operator não gerencia users', () => {
      expect(checkPermission('operator', 'users', 'write')).toBe(false);
    });
  });

  describe('RBAC — admin tem acesso completo ao necessário', () => {
    it('admin pode write tickets', () => {
      expect(checkPermission('admin', 'tickets', 'write')).toBe(true);
    });
    it('admin pode write customers', () => {
      expect(checkPermission('admin', 'customers', 'write')).toBe(true);
    });
    it('admin pode read reports', () => {
      expect(checkPermission('admin', 'reports', 'read')).toBe(true);
    });
  });
});

describe('OWASP A04 — Insecure Design (right-to-be-forgotten)', () => {
  it('LGPD forget inclui todas as camadas de dados', () => {
    const plan = planCustomerForget(p({ role: 'admin' }), 't1');
    expect(plan.allowed).toBe(true);
    expect(plan.targets).toContain('customers');
    expect(plan.targets).toContain('messages');
    expect(plan.targets).toContain('conversations');
    expect(plan.targets).toContain('invoices');
    expect(plan.targets).toContain('zep_memory');
    expect(plan.targets).toContain('qdrant_vectors');
    expect(plan.targets).toContain('r2_media');
  });

  it('LGPD forget bloqueia viewer/operator', () => {
    for (const role of ['viewer', 'operator'] as const) {
      const plan = planCustomerForget(p({ role }), 't1');
      expect(plan.allowed).toBe(false);
      expect(plan.reason).toBe('insufficient_role');
    }
  });

  it('LGPD forget bloqueia cross-tenant mesmo para admin', () => {
    const plan = planCustomerForget(p({ role: 'admin', tenantId: 't1' }), 't2');
    expect(plan.allowed).toBe(false);
    expect(plan.reason).toBe('cross_tenant');
  });

  it('super_admin pode expurgar de qualquer tenant', () => {
    const plan = planCustomerForget(p({ role: 'super_admin', tenantId: 'astrum' }), 't99');
    expect(plan.allowed).toBe(true);
  });
});

describe('OWASP A07 — Security Headers (Helmet config)', () => {
  it('Helmet configurado com CSP restritivo', { timeout: 30_000 }, async () => {
    const origSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'a'.repeat(32);
    try {
      const mod = await import('../../server');
      const app = await mod.buildServer();
      const res = await app.inject({ method: 'GET', url: '/api/v2/health' });
      const csp = res.headers['content-security-policy'];
      expect(csp).toBeDefined();
      expect(String(csp)).toContain("default-src 'self'");
      expect(String(csp)).toContain("script-src 'self'");
      await app.close();
    } finally {
      process.env.JWT_SECRET = origSecret;
    }
  });
});

describe('OWASP A05 — Security Misconfiguration (rate limits)', () => {
  it('rate limit configs existem para rotas sensíveis', async () => {
    const { RATE_LIMIT_CONFIGS } = await import('../rate-limit/token-bucket.service');
    expect(RATE_LIMIT_CONFIGS.ai).toBeDefined();
    expect(RATE_LIMIT_CONFIGS.billing).toBeDefined();
    expect(RATE_LIMIT_CONFIGS.webhooks).toBeDefined();
    expect(RATE_LIMIT_CONFIGS.default).toBeDefined();
    expect(RATE_LIMIT_CONFIGS.ai.capacity).toBeLessThanOrEqual(20);
    expect(RATE_LIMIT_CONFIGS.billing.capacity).toBeLessThanOrEqual(10);
  });
});

describe('OWASP A02 — Cryptographic Failures', () => {
  it('Zod schema rejeita JWT_SECRET curto', () => {
    const { z } = require('zod');
    const schema = z.object({
      JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),
    });
    expect(() => schema.parse({ JWT_SECRET: 'short' })).toThrow(/32/);
  });

  it('Zod schema aceita JWT_SECRET >= 32 chars', () => {
    const { z } = require('zod');
    const schema = z.object({
      JWT_SECRET: z.string().min(32),
    });
    expect(() => schema.parse({ JWT_SECRET: 'a'.repeat(32) })).not.toThrow();
  });

  it('buildServer rejeita JWT_SECRET curto', { timeout: 15_000 }, async () => {
    const origSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'short';
    try {
      const mod = await import('../../server');
      await expect(mod.buildServer()).rejects.toThrow(/JWT_SECRET/);
    } finally {
      process.env.JWT_SECRET = origSecret;
    }
  });
});
