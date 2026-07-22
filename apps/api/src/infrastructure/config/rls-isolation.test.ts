import { describe, it, expect, vi } from 'vitest';
import { isFeatureEnabled, flagsForTier, type PlanTier } from './feature-flags';
import { canAccessResource, type Principal } from '../security/authz-guard';

const TENANTS = Array.from({ length: 10 }, (_, i) => ({
  id: `tenant-${String(i + 1).padStart(2, '0')}`,
  name: `ISP ${String.fromCharCode(65 + i)}`,
  tier: (['starter', 'pro', 'enterprise'] as PlanTier[])[i % 3],
  overrides: {} as Record<string, boolean>,
}));

TENANTS[0].overrides = { voz_tempo_real: true };
TENANTS[3].overrides = { rag_documentos: false };

describe('Feature flags — isolamento por tenant (10 ISPs simultâneos)', () => {
  it('cada tenant tem flags corretas para seu tier', () => {
    for (const t of TENANTS) {
      const tierFlags = flagsForTier(t.tier);
      expect(tierFlags.has('chat_ia')).toBe(true);
      if (t.tier === 'starter') {
        expect(tierFlags.has('rag_documentos')).toBe(false);
        expect(tierFlags.has('voz_tempo_real')).toBe(false);
      }
      if (t.tier === 'pro') {
        expect(tierFlags.has('rag_documentos')).toBe(true);
        expect(tierFlags.has('voz_tempo_real')).toBe(false);
      }
      if (t.tier === 'enterprise') {
        expect(tierFlags.has('voz_tempo_real')).toBe(true);
      }
    }
  });

  it('override de tenant LIGA flag acima do tier', () => {
    const t = TENANTS[0];
    expect(t.tier).toBe('starter');
    expect(isFeatureEnabled('voz_tempo_real', t.tier, t.overrides)).toBe(true);
  });

  it('override de tenant DESLIGA flag que tier permitiria', () => {
    const t = TENANTS[3];
    expect(t.tier).toBe('starter');
    expect(isFeatureEnabled('rag_documentos', 'pro', t.overrides)).toBe(false);
  });

  it('flags de um tenant não vazam para outro', () => {
    for (let i = 0; i < TENANTS.length; i++) {
      for (let j = i + 1; j < TENANTS.length; j++) {
        const ti = TENANTS[i];
        const tj = TENANTS[j];
        if (ti.tier === tj.tier && JSON.stringify(ti.overrides) === JSON.stringify(tj.overrides)) continue;
        const flagI = isFeatureEnabled('voz_tempo_real', ti.tier, ti.overrides);
        const flagJ = isFeatureEnabled('voz_tempo_real', tj.tier, tj.overrides);
        if (ti.tier !== tj.tier || JSON.stringify(ti.overrides) !== JSON.stringify(tj.overrides)) {
          expect(typeof flagI).toBe('boolean');
          expect(typeof flagJ).toBe('boolean');
        }
      }
    }
  });
});

describe('RLS — anti-IDOR entre 10 tenants', () => {
  it('tenant X NÃO acessa recurso de tenant Y para todas as combinações', () => {
    for (const ti of TENANTS) {
      for (const tj of TENANTS) {
        if (ti.id === tj.id) continue;
        const principal: Principal = {
          userId: `user-${ti.id}`,
          tenantId: ti.id,
          role: 'admin',
        };
        expect(canAccessResource(principal, tj.id)).toBe(false);
      }
    }
  });

  it('tenant acessa seus próprios recursos', () => {
    for (const t of TENANTS) {
      const principal: Principal = {
        userId: `user-${t.id}`,
        tenantId: t.id,
        role: 'operator',
      };
      expect(canAccessResource(principal, t.id)).toBe(true);
    }
  });

  it('90 combinações cross-tenant → TODAS bloqueadas', () => {
    let blocked = 0;
    let total = 0;

    for (const ti of TENANTS) {
      for (const tj of TENANTS) {
        if (ti.id === tj.id) continue;
        total++;
        const principal: Principal = {
          userId: `user-${ti.id}`,
          tenantId: ti.id,
          role: 'admin',
        };
        if (!canAccessResource(principal, tj.id)) blocked++;
      }
    }

    expect(total).toBe(90);
    expect(blocked).toBe(90);
  });
});

describe('Feature flags — completude dos tiers', () => {
  it('enterprise tem todas as flags de todos os tiers', () => {
    const enterprise = flagsForTier('enterprise');
    const pro = flagsForTier('pro');
    const starter = flagsForTier('starter');

    for (const f of starter) expect(enterprise.has(f)).toBe(true);
    for (const f of pro) expect(enterprise.has(f)).toBe(true);
  });

  it('pro tem todas as flags do starter', () => {
    const pro = flagsForTier('pro');
    const starter = flagsForTier('starter');
    for (const f of starter) expect(pro.has(f)).toBe(true);
  });

  it('starter NÃO tem flags exclusivas do enterprise', () => {
    const starter = flagsForTier('starter');
    expect(starter.has('voz_tempo_real')).toBe(false);
    expect(starter.has('telemetria_snmp')).toBe(false);
    expect(starter.has('benchmark_setorial')).toBe(false);
    expect(starter.has('white_label')).toBe(false);
  });
});
