/**
 * Dossiê #90 — Exportação Programável Automática.
 * Permite agendar exportações recorrentes (diária/semanal/mensal)
 * de entidades do tenant com envio por email ou webhook.
 */

export type ExportSchedule = 'daily' | 'weekly' | 'monthly';
export type ExportDelivery = 'email' | 'webhook';

export interface ScheduledExportConfig {
  id: string;
  tenantId: string;
  entity: string;
  format: 'json' | 'csv';
  schedule: ExportSchedule;
  delivery: ExportDelivery;
  destination: string;
  enabled: boolean;
  lastRunAt?: string;
  filters?: Record<string, string>;
}

export interface ScheduledExportResult {
  configId: string;
  success: boolean;
  rowCount: number;
  deliveredTo: string;
  error?: string;
}

export interface ScheduledExportPorts {
  getActiveConfigs: (schedule: ExportSchedule) => Promise<ScheduledExportConfig[]>;
  exportData: (tenantId: string, entity: string, format: 'json' | 'csv', filters?: Record<string, string>) => Promise<{ content: string; rowCount: number }>;
  sendEmail: (to: string, subject: string, attachmentName: string, attachmentContent: string) => Promise<void>;
  callWebhook: (url: string, payload: string) => Promise<void>;
  updateLastRun: (configId: string, runAt: string) => Promise<void>;
}

export function shouldRunToday(schedule: ExportSchedule, now: Date = new Date()): boolean {
  switch (schedule) {
    case 'daily': return true;
    case 'weekly': return now.getUTCDay() === 1;
    case 'monthly': return now.getUTCDate() === 1;
  }
}

export async function runScheduledExports(
  schedule: ExportSchedule,
  ports: ScheduledExportPorts,
  now: Date = new Date(),
): Promise<ScheduledExportResult[]> {
  if (!shouldRunToday(schedule, now)) return [];

  const configs = await ports.getActiveConfigs(schedule);
  const results: ScheduledExportResult[] = [];

  for (const cfg of configs) {
    if (!cfg.enabled) continue;
    try {
      const { content, rowCount } = await ports.exportData(cfg.tenantId, cfg.entity, cfg.format, cfg.filters);
      const filename = `${cfg.entity}_${now.toISOString().slice(0, 10)}.${cfg.format}`;

      if (cfg.delivery === 'email') {
        await ports.sendEmail(cfg.destination, `Exportação automática: ${cfg.entity}`, filename, content);
      } else {
        await ports.callWebhook(cfg.destination, content);
      }

      await ports.updateLastRun(cfg.id, now.toISOString());
      results.push({ configId: cfg.id, success: true, rowCount, deliveredTo: cfg.destination });
    } catch (err) {
      results.push({ configId: cfg.id, success: false, rowCount: 0, deliveredTo: cfg.destination, error: (err as Error).message });
    }
  }

  return results;
}
