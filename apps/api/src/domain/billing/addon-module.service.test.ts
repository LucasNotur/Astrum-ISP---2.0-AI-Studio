import { describe, it, expect, vi } from 'vitest';
import { isCompatible, calculateAddOnTotal, getActiveFeatureFlags, activateAddOn, AddOn, AddOnPorts, TenantAddOn } from './addon-module.service';

const ADDONS: AddOn[] = [
  { id: 'rag', name: 'RAG Multimodal', description: 'PDFs + docs', monthlyPrice: 49.9, featureFlags: ['rag_enabled', 'pdf_upload'], category: 'ai', requiredPlan: 'pro' },
  { id: 'whatsapp', name: 'WhatsApp Extra', description: '+1 número', monthlyPrice: 29.9, featureFlags: ['multi_whatsapp'], category: 'communication' },
  { id: 'audit', name: 'Auditoria Avançada', description: 'Hash-chain logs', monthlyPrice: 19.9, featureFlags: ['audit_advanced'], category: 'security', requiredPlan: 'enterprise' },
];

function makePorts(): AddOnPorts {
  return {
    listAvailable: vi.fn().mockResolvedValue(ADDONS),
    getTenantAddOns: vi.fn().mockResolvedValue([]),
    activateAddOn: vi.fn().mockResolvedValue({ tenantId: 't1', addonId: 'whatsapp', activatedAt: '2026-07-22', status: 'active' }),
    deactivateAddOn: vi.fn().mockResolvedValue(undefined),
    getTenantPlan: vi.fn().mockResolvedValue('pro'),
  };
}

describe('addon-module.service', () => {
  describe('isCompatible', () => {
    it('aceita add-on sem requiredPlan', () => {
      expect(isCompatible(ADDONS[1], 'starter')).toBe(true);
    });

    it('aceita add-on quando plano é suficiente', () => {
      expect(isCompatible(ADDONS[0], 'pro')).toBe(true);
      expect(isCompatible(ADDONS[0], 'enterprise')).toBe(true);
    });

    it('rejeita add-on quando plano insuficiente', () => {
      expect(isCompatible(ADDONS[0], 'starter')).toBe(false);
      expect(isCompatible(ADDONS[2], 'pro')).toBe(false);
    });
  });

  describe('calculateAddOnTotal', () => {
    it('soma preços dos add-ons ativos', () => {
      expect(calculateAddOnTotal(ADDONS, ['rag', 'whatsapp'])).toBeCloseTo(79.8);
    });

    it('retorna 0 sem add-ons ativos', () => {
      expect(calculateAddOnTotal(ADDONS, [])).toBe(0);
    });
  });

  describe('getActiveFeatureFlags', () => {
    it('retorna flags dos add-ons ativos', () => {
      const flags = getActiveFeatureFlags(ADDONS, ['rag']);
      expect(flags).toContain('rag_enabled');
      expect(flags).toContain('pdf_upload');
      expect(flags).not.toContain('multi_whatsapp');
    });
  });

  describe('activateAddOn', () => {
    it('ativa add-on compatível', async () => {
      const ports = makePorts();
      const result = await activateAddOn('t1', 'whatsapp', ports);
      expect(result.ok).toBe(true);
      expect(result.addon?.status).toBe('active');
    });

    it('rejeita add-on não encontrado', async () => {
      const ports = makePorts();
      const result = await activateAddOn('t1', 'inexistente', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('não encontrado');
    });

    it('rejeita add-on incompatível com plano', async () => {
      const ports = makePorts();
      (ports.getTenantPlan as any).mockResolvedValue('starter');
      const result = await activateAddOn('t1', 'rag', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('plano');
    });

    it('rejeita add-on já ativo', async () => {
      const ports = makePorts();
      (ports.getTenantAddOns as any).mockResolvedValue([{ addonId: 'whatsapp', status: 'active' }]);
      const result = await activateAddOn('t1', 'whatsapp', ports);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('já ativo');
    });
  });
});
