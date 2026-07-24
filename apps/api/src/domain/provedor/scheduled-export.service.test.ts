import { describe, it, expect, vi } from 'vitest';
import { shouldRunToday, runScheduledExports, ScheduledExportPorts, ScheduledExportConfig } from './scheduled-export.service';

function makeConfig(overrides: Partial<ScheduledExportConfig> = {}): ScheduledExportConfig {
  return { id: 'exp1', tenantId: 't1', entity: 'customers', format: 'csv', schedule: 'daily', delivery: 'email', destination: 'admin@isp.com', enabled: true, ...overrides };
}

function makePorts(): ScheduledExportPorts {
  return {
    getActiveConfigs: vi.fn().mockResolvedValue([makeConfig()]),
    exportData: vi.fn().mockResolvedValue({ content: 'id,name\n1,João', rowCount: 1 }),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    callWebhook: vi.fn().mockResolvedValue(undefined),
    updateLastRun: vi.fn().mockResolvedValue(undefined),
  };
}

describe('scheduled-export.service', () => {
  describe('shouldRunToday', () => {
    it('daily roda sempre', () => {
      expect(shouldRunToday('daily', new Date('2026-07-22'))).toBe(true);
    });

    it('weekly roda na segunda-feira', () => {
      expect(shouldRunToday('weekly', new Date('2026-07-20T12:00:00Z'))).toBe(true); // Monday
      expect(shouldRunToday('weekly', new Date('2026-07-22T12:00:00Z'))).toBe(false); // Wednesday
    });

    it('monthly roda no dia 1', () => {
      expect(shouldRunToday('monthly', new Date('2026-07-01T12:00:00Z'))).toBe(true);
      expect(shouldRunToday('monthly', new Date('2026-07-15T12:00:00Z'))).toBe(false);
    });
  });

  describe('runScheduledExports', () => {
    it('exporta e envia por email', async () => {
      const ports = makePorts();
      const results = await runScheduledExports('daily', ports, new Date('2026-07-22'));
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].rowCount).toBe(1);
      expect(ports.sendEmail).toHaveBeenCalledOnce();
      expect(ports.updateLastRun).toHaveBeenCalledOnce();
    });

    it('exporta e envia por webhook', async () => {
      const ports = makePorts();
      (ports.getActiveConfigs as any).mockResolvedValue([makeConfig({ delivery: 'webhook', destination: 'https://hook.io/abc' })]);
      const results = await runScheduledExports('daily', ports, new Date('2026-07-22'));
      expect(results[0].success).toBe(true);
      expect(ports.callWebhook).toHaveBeenCalledOnce();
    });

    it('captura erro sem crashar', async () => {
      const ports = makePorts();
      (ports.exportData as any).mockRejectedValue(new Error('DB timeout'));
      const results = await runScheduledExports('daily', ports, new Date('2026-07-22'));
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('DB timeout');
    });

    it('não roda se não é dia do schedule', async () => {
      const ports = makePorts();
      (ports.getActiveConfigs as any).mockResolvedValue([makeConfig({ schedule: 'weekly' })]);
      const results = await runScheduledExports('weekly', ports, new Date('2026-07-22')); // Wednesday
      expect(results).toHaveLength(0);
    });

    it('pula configs desabilitadas', async () => {
      const ports = makePorts();
      (ports.getActiveConfigs as any).mockResolvedValue([makeConfig({ enabled: false })]);
      const results = await runScheduledExports('daily', ports, new Date('2026-07-22'));
      expect(results).toHaveLength(0);
    });
  });
});
