import { describe, it, expect, vi } from 'vitest';
import { personalizeMessage, executeCampaign, RetentionCampaign, BroadcastPorts, CampaignTarget } from './broadcast-retention.service';

const TARGET: CampaignTarget = { customerId: 'c1', customerName: 'João Silva', phone: '11999999999', churnRisk: 0.75, plan: '200Mbps' };

const CAMPAIGN: RetentionCampaign = {
  id: 'camp1', tenantId: 't1', name: 'Retenção Jul',
  segmentFilter: { churnRiskMin: 0.6, churnRiskMax: 1.0 },
  messageTemplate: 'Olá {{nome}}! Vimos que seu plano {{plano}} pode ser melhorado. Risco: {{risco}}.',
  channel: 'whatsapp', scheduledAt: '2026-07-22', status: 'scheduled', throttlePerMinute: 60,
};

function makePorts(targets: CampaignTarget[] = [TARGET]): BroadcastPorts {
  return {
    getTargets: vi.fn().mockResolvedValue(targets),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    updateCampaignStatus: vi.fn().mockResolvedValue(undefined),
  };
}

describe('broadcast-retention.service', () => {
  describe('personalizeMessage', () => {
    it('substitui placeholders', () => {
      const msg = personalizeMessage('Olá {{nome}}, plano {{plano}}, risco {{risco}}.', TARGET);
      expect(msg).toBe('Olá João Silva, plano 200Mbps, risco 75%.');
    });
  });

  describe('executeCampaign', () => {
    it('envia mensagem para todos os targets', async () => {
      const targets = [TARGET, { ...TARGET, customerId: 'c2', customerName: 'Maria' }];
      const ports = makePorts(targets);
      const result = await executeCampaign(CAMPAIGN, ports);
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(ports.sendMessage).toHaveBeenCalledTimes(2);
      expect(ports.updateCampaignStatus).toHaveBeenCalledWith('camp1', 'running');
      expect(ports.updateCampaignStatus).toHaveBeenCalledWith('camp1', 'completed');
    });

    it('captura erros sem parar campanha', async () => {
      const ports = makePorts();
      (ports.sendMessage as any).mockRejectedValue(new Error('Rate limited'));
      const result = await executeCampaign(CAMPAIGN, ports);
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toBe('Rate limited');
    });

    it('retorna resultado vazio sem targets', async () => {
      const ports = makePorts([]);
      const result = await executeCampaign(CAMPAIGN, ports);
      expect(result.totalTargets).toBe(0);
      expect(result.sent).toBe(0);
    });
  });
});
