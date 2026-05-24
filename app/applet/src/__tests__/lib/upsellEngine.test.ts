import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpsellEngine, Customer, FirestoreDB } from '../../../src/lib/upsellEngine';

const mockDb: import('vitest').Mocked<FirestoreDB> = {
  saveUpsellEvent: vi.fn(),
  saveCsatRating: vi.fn(),
  closeTicket: vi.fn(),
  scheduleNpsJob: vi.fn(),
};

describe('Upsell and NPS Engine Tests', () => {
  let engine: UpsellEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new UpsellEngine(mockDb);
  });

  it('1. 2+ condições de upsell satisfeitas -> should_upsell=true com suggested_plan correto', () => {
    const customer: Customer = {
      id: 'c1',
      plan: 'FREE',
      conditions_met: ['high_traffic', 'needs_api']
    };
    
    const result = engine.evaluateUpsell(customer);
    expect(result.should_upsell).toBe(true);
    expect(result.suggested_plan).toBe('PRO');
  });

  it('2. Apenas 1 condição -> should_upsell=false', () => {
    const customer: Customer = {
      id: 'c2',
      plan: 'FREE',
      conditions_met: ['needs_api']
    };
    
    const result = engine.evaluateUpsell(customer);
    expect(result.should_upsell).toBe(false);
  });

  it('3. Cliente no plano ENTERPRISE -> should_upsell=false independente das condições', () => {
    const customer: Customer = {
      id: 'c3',
      plan: 'ENTERPRISE',
      conditions_met: ['needs_api', 'high_traffic', 'premium_support']
    };
    
    const result = engine.evaluateUpsell(customer);
    expect(result.should_upsell).toBe(false);
  });

  it('4. Oferta feita -> evento salvo em upsell_events com outcome=interested', async () => {
    await engine.recordUpsellOffer('c1', 'PRO', 'interested');
    expect(mockDb.saveUpsellEvent).toHaveBeenCalledWith('c1', 'PRO', 'interested');
  });

  it('5. NPS recebido como número 1-5 -> salva em csat_ratings e fecha ticket', async () => {
    const handled = await engine.processCustomerMessage('t1', ' 4 ');
    
    expect(handled).toBe(true);
    expect(mockDb.saveCsatRating).toHaveBeenCalledWith('t1', 4);
    expect(mockDb.closeTicket).toHaveBeenCalledWith('t1');
  });

  it('6. NPS recebido como texto ("ótimo") -> NÃO tratado como NPS, ticket não é fechado', async () => {
    const handled = await engine.processCustomerMessage('t2', 'ótimo');
    
    expect(handled).toBe(false);
    expect(mockDb.saveCsatRating).not.toHaveBeenCalled();
    expect(mockDb.closeTicket).not.toHaveBeenCalled();
  });

  it('7. NPS solicitado -> job scheduled com delay correto (não dispara imediatamente)', async () => {
    await engine.requestNPS('t3');
    
    expect(mockDb.scheduleNpsJob).toHaveBeenCalledWith('t3', 86400000); // 24h
  });
});
