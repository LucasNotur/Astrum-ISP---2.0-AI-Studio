import { describe, it, expect, vi } from 'vitest';
import { classifyLead, processFollowUps, DEFAULT_FOLLOWUP_CONFIG, Lead, LeadFollowUpPorts } from './lead-followup.service';

const NOW = new Date('2026-07-22T12:00:00Z');

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'l1', tenantId: 't1', customerName: 'João', phone: '11999999999',
    status: 'contacted', lastContactAt: '2026-07-18T10:00:00Z', createdAt: '2026-07-15T10:00:00Z',
    interest: '200Mbps', ...overrides,
  };
}

function makePorts(leads: Lead[] = []): LeadFollowUpPorts {
  return {
    getActiveLeads: vi.fn().mockResolvedValue(leads),
    getFollowUpCount: vi.fn().mockResolvedValue(1),
    generateMessage: vi.fn().mockResolvedValue('Olá João, tudo bem? Sobre o plano 200Mbps...'),
    sendFollowUp: vi.fn().mockResolvedValue(undefined),
    markStale: vi.fn().mockResolvedValue(undefined),
  };
}

describe('lead-followup.service', () => {
  describe('classifyLead', () => {
    it('agenda follow-up quando intervalo atingido e abaixo do max', () => {
      const lead = makeLead({ lastContactAt: '2026-07-19T12:00:00Z' });
      const action = classifyLead(lead, 1, DEFAULT_FOLLOWUP_CONFIG, NOW);
      expect(action?.action).toBe('send_message');
    });

    it('marca stale quando excede max follow-ups e dias', () => {
      const lead = makeLead({ lastContactAt: '2026-07-10T12:00:00Z' });
      const action = classifyLead(lead, 3, DEFAULT_FOLLOWUP_CONFIG, NOW);
      expect(action?.action).toBe('mark_stale');
    });

    it('ignora leads won/lost/stale', () => {
      expect(classifyLead(makeLead({ status: 'won' }), 0, DEFAULT_FOLLOWUP_CONFIG, NOW)).toBeNull();
      expect(classifyLead(makeLead({ status: 'lost' }), 0, DEFAULT_FOLLOWUP_CONFIG, NOW)).toBeNull();
      expect(classifyLead(makeLead({ status: 'stale' }), 0, DEFAULT_FOLLOWUP_CONFIG, NOW)).toBeNull();
    });

    it('nenhuma ação se contato recente', () => {
      const lead = makeLead({ lastContactAt: '2026-07-21T12:00:00Z' });
      const action = classifyLead(lead, 0, DEFAULT_FOLLOWUP_CONFIG, NOW);
      expect(action).toBeNull();
    });
  });

  describe('processFollowUps', () => {
    it('envia mensagem para lead que precisa de follow-up', async () => {
      const lead = makeLead({ lastContactAt: '2026-07-19T12:00:00Z' });
      const ports = makePorts([lead]);
      const actions = await processFollowUps('t1', ports, DEFAULT_FOLLOWUP_CONFIG, NOW);
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe('send_message');
      expect(actions[0].message).toContain('João');
      expect(ports.sendFollowUp).toHaveBeenCalledOnce();
    });

    it('marca stale quando excede limites', async () => {
      const lead = makeLead({ lastContactAt: '2026-07-10T12:00:00Z' });
      const ports = makePorts([lead]);
      (ports.getFollowUpCount as any).mockResolvedValue(3);
      const actions = await processFollowUps('t1', ports, DEFAULT_FOLLOWUP_CONFIG, NOW);
      expect(actions[0].action).toBe('mark_stale');
      expect(ports.markStale).toHaveBeenCalledOnce();
    });

    it('retorna vazio sem leads ativos', async () => {
      const ports = makePorts([]);
      const actions = await processFollowUps('t1', ports, DEFAULT_FOLLOWUP_CONFIG, NOW);
      expect(actions).toHaveLength(0);
    });
  });
});
