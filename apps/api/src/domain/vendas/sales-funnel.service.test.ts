import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ViabilityResult, ErpPlan } from '../../adapters/erp/erp.types';

// vi.hoisted garante que a variável existe antes do hoisting dos vi.mock.
const mockErpAdapter = vi.hoisted(() => ({
  name: 'ixc' as const,
  findCustomerByCpf: vi.fn(),
  getBillingStatus: vi.fn(),
  generateSecondCopy: vi.fn(),
  getConnectionStatus: vi.fn(),
  unlockCustomer: vi.fn(),
  checkViability: vi.fn().mockResolvedValue<ViabilityResult>({ available: true, ctoId: 'cto-1', availablePorts: 5 }),
  getPlans: vi.fn().mockResolvedValue<ErpPlan[]>([]),
  createPreRegistration: vi.fn().mockResolvedValue({ leadId: 'erp-lead-1' }),
  scheduleInstallation: vi.fn().mockResolvedValue({ orderId: 'os-erp-1' }),
}));

vi.mock('../../adapters/erp/credential-cipher', () => ({
  decryptCredentials: vi.fn().mockReturnValue({ url: 'http://erp', token: 'tok' }),
}));

vi.mock('../../adapters/erp/erp.factory', () => ({
  createErpProvider: vi.fn().mockReturnValue(mockErpAdapter),
  isErpImplemented: vi.fn().mockReturnValue(true),
}));

vi.mock('../rede/network-graph.service', () => ({
  capacidade: vi.fn().mockResolvedValue({ ctos: [{ id: 'cto-g', name: 'CTO Grafo', availablePorts: 3 }] }),
  impactoCto: vi.fn(),
  reincidencia: vi.fn(),
  defaultDb: {},
}));

import {
  getOrCreateLead,
  updateLead,
  checkViability,
  getAvailablePlans,
  registerLeadInErp,
  scheduleInstallation,
  type SalesFunnelDb,
} from './sales-funnel.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function credChainWith(erpData: any) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: erpData }),
  };
}

function makeInsertChain(returnData: any) {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: returnData, error: null }),
    }),
  };
}

// ── getOrCreateLead ───────────────────────────────────────────────────────────

describe('getOrCreateLead', () => {
  it('retorna lead existente quando encontrado', async () => {
    const existing = { id: 'lead-1', tenant_id: 't1', conversation_id: 'c1', stage: 'presenting_plans' };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: existing }),
    };
    const db: SalesFunnelDb = { from: vi.fn().mockReturnValue(chain) } as any;

    const result = await getOrCreateLead(db, 't1', 'c1');
    expect(result.id).toBe('lead-1');
    expect(result.stage).toBe('presenting_plans');
  });

  it('cria novo lead quando não existe', async () => {
    const newLead = { id: 'lead-new', tenant_id: 't1', conversation_id: 'c1', stage: 'collecting_address' };
    const findChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    };
    const insertChain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: newLead, error: null }),
    };
    let call = 0;
    const db: SalesFunnelDb = {
      from: vi.fn().mockImplementation(() => {
        call++;
        return call === 1 ? findChain : insertChain;
      }),
    } as any;

    const result = await getOrCreateLead(db, 't1', 'c1');
    expect(result.stage).toBe('collecting_address');
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 't1', conversation_id: 'c1', stage: 'collecting_address' }),
    );
  });

  it('lança erro quando insert retorna erro', async () => {
    const findChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    };
    const insertChain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
    };
    let call = 0;
    const db: SalesFunnelDb = {
      from: vi.fn().mockImplementation(() => { call++; return call === 1 ? findChain : insertChain; }),
    } as any;

    await expect(getOrCreateLead(db, 't1', 'c1')).rejects.toThrow('db error');
  });
});

// ── updateLead ────────────────────────────────────────────────────────────────

describe('updateLead', () => {
  it('chama update com patch correto', async () => {
    const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    const db: SalesFunnelDb = { from: vi.fn().mockReturnValue(chain) } as any;

    await updateLead(db, 'lead-1', { stage: 'presenting_plans', address: 'Rua A, 1' });

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'presenting_plans', address: 'Rua A, 1' }),
    );
    expect(chain.eq).toHaveBeenCalledWith('id', 'lead-1');
  });
});

// ── checkViability ────────────────────────────────────────────────────────────

describe('checkViability', () => {
  beforeEach(() => vi.clearAllMocks());

  it('usa ERP quando configurado — retorna resultado do adapter', async () => {
    const db: SalesFunnelDb = {
      from: vi.fn().mockReturnValue(credChainWith({ provider: 'ixc', credentials_encrypted: 'enc' })),
    } as any;

    const result = await checkViability('t1', 'Rua A, 1', db);

    expect(result.available).toBe(true);
    expect(result.ctoId).toBe('cto-1');
    expect(mockErpAdapter.checkViability).toHaveBeenCalledWith('Rua A, 1');
  });

  it('usa grafo local quando tenant sem ERP configurado', async () => {
    const db: SalesFunnelDb = {
      from: vi.fn().mockReturnValue(credChainWith(null)),
    } as any;

    const { capacidade } = await import('../rede/network-graph.service');

    const result = await checkViability('t1', 'Rua B, 99', db);

    expect(capacidade).toHaveBeenCalled();
    expect(result.available).toBe(true);
    expect(result.ctoName).toBe('CTO Grafo');
  });

  it('fail-open quando grafo também falha — retorna available=true', async () => {
    const { capacidade } = await import('../rede/network-graph.service');
    (capacidade as any).mockRejectedValueOnce(new Error('graph down'));

    const db: SalesFunnelDb = {
      from: vi.fn().mockReturnValue(credChainWith(null)),
    } as any;

    const result = await checkViability('t1', 'Rua C, 0', db);
    expect(result.available).toBe(true);
    expect((result.raw as any)?.fallback).toBe(true);
  });
});

// ── getAvailablePlans ─────────────────────────────────────────────────────────

describe('getAvailablePlans', () => {
  beforeEach(() => vi.clearAllMocks());

  it('usa ERP quando disponível e retorna planos normalizados', async () => {
    const erpPlans: ErpPlan[] = [
      { id: 'p1', name: 'Basic', downloadMbps: 100, uploadMbps: 20, priceCents: 8990 },
    ];
    (mockErpAdapter.getPlans as any).mockResolvedValueOnce(erpPlans);

    const db: SalesFunnelDb = {
      from: vi.fn().mockReturnValue(credChainWith({ provider: 'ixc', credentials_encrypted: 'enc' })),
    } as any;

    const plans = await getAvailablePlans('t1', db);
    expect(plans).toHaveLength(1);
    expect(plans[0].name).toBe('Basic');
  });

  it('retorna planos do Supabase quando sem ERP', async () => {
    const plansChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ id: 'p2', name: 'Local', download_mbps: 200, upload_mbps: 50, price_cents: 9990 }],
      }),
    };
    let call = 0;
    const db: SalesFunnelDb = {
      from: vi.fn().mockImplementation(() => {
        call++;
        return call === 1
          ? credChainWith(null)
          : plansChain;
      }),
    } as any;

    const plans = await getAvailablePlans('t1', db);
    expect(plans).toHaveLength(1);
    expect(plans[0].downloadMbps).toBe(200);
  });
});

// ── registerLeadInErp ─────────────────────────────────────────────────────────

describe('registerLeadInErp', () => {
  it('lança erro com dados incompletos', async () => {
    const db: SalesFunnelDb = {
      from: vi.fn().mockReturnValue(credChainWith(null)),
    } as any;
    const incompleteLead = { id: 'l1', tenant_id: 't1', conversation_id: 'c1', stage: 'registering' as const };
    await expect(registerLeadInErp('t1', incompleteLead, db)).rejects.toThrow('Dados incompletos');
  });

  it('retorna erpLeadId local quando sem ERP configurado', async () => {
    const db: SalesFunnelDb = {
      from: vi.fn().mockReturnValue(credChainWith(null)),
    } as any;
    const lead = {
      id: 'lead-abc', tenant_id: 't1', conversation_id: 'c1', stage: 'registering' as const,
      full_name: 'João Silva', cpf: '12345678900', phone: '11999999999',
      address: 'Rua A, 1', selected_plan_id: 'plan-1',
    };

    const { erpLeadId } = await registerLeadInErp('t1', lead, db);
    expect(erpLeadId).toBe('local_lead-abc');
  });

  it('usa ERP quando configurado', async () => {
    beforeEach(() => vi.clearAllMocks());
    (mockErpAdapter.createPreRegistration as any).mockResolvedValueOnce({ leadId: 'erp-123' });

    const db: SalesFunnelDb = {
      from: vi.fn().mockReturnValue(credChainWith({ provider: 'ixc', credentials_encrypted: 'enc' })),
    } as any;
    const lead = {
      id: 'lead-xyz', tenant_id: 't1', conversation_id: 'c1', stage: 'registering' as const,
      full_name: 'Maria', cpf: '98765432100', phone: '21988888888',
      address: 'Av B, 200', selected_plan_id: 'plan-2',
    };

    const { erpLeadId } = await registerLeadInErp('t1', lead, db);
    expect(erpLeadId).toBe('erp-123');
  });
});

// ── scheduleInstallation ──────────────────────────────────────────────────────

describe('scheduleInstallation', () => {
  it('cria OS no Supabase quando sem ERP', async () => {
    const orderId = 'os-uuid-123';
    const insertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: orderId }, error: null }),
    };
    let call = 0;
    const db: SalesFunnelDb = {
      from: vi.fn().mockImplementation(() => {
        call++;
        return call === 1 ? credChainWith(null) : insertChain;
      }),
    } as any;

    const lead = { id: 'l1', tenant_id: 't1', conversation_id: 'c1', stage: 'scheduling' as const, address: 'Rua A, 1' };
    const result = await scheduleInstallation('t1', lead, '2026-07-20', db);
    expect(result.orderId).toBe(orderId);
  });
});
