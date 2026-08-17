import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../infrastructure/logging/logger', () => ({
  atendimentoLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { atendimentoLogger } from '../../infrastructure/logging/logger';
import {
  buildSnapshotRow,
  runWhatsappHealthSnapshot,
  type WhatsAppHealthSnapshotPorts,
} from './whatsapp-health-snapshot.worker';

const loggerMock = atendimentoLogger as any;

function makePorts(over: Partial<WhatsAppHealthSnapshotPorts> = {}): WhatsAppHealthSnapshotPorts {
  return {
    listInstances: async () => [
      { tenantId: 't1', instanceId: 'inst-a' },
      { tenantId: 't2', instanceId: 'inst-b' },
    ],
    computeStats: async () => ({
      ban_signals: 2,
      is_paused: false,
      daily_messages_today: 41,
      messages_in_queue: 5,
    }),
    insertSnapshot: async () => {},
    ...over,
  };
}

describe('buildSnapshotRow', () => {
  it('monta a linha com os campos da tabela e o risk_level derivado', () => {
    const row = buildSnapshotRow('t1', 'inst-a', {
      ban_signals: 2,
      is_paused: false,
      daily_messages_today: 41,
      messages_in_queue: 5,
    });

    expect(row).toEqual({
      tenant_id: 't1',
      instance_id: 'inst-a',
      ban_signals: 2,
      is_paused: false,
      daily_messages_today: 41,
      messages_in_queue: 5,
      risk_level: 'warning',
    });
  });

  it('is_paused=true → critical mesmo com ban_signals=0', () => {
    const row = buildSnapshotRow('t1', 'inst-a', {
      ban_signals: 0,
      is_paused: true,
      daily_messages_today: 10,
      messages_in_queue: 0,
    });
    expect(row.risk_level).toBe('critical');
  });
});

describe('runWhatsappHealthSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captura e insere um snapshot por instância', async () => {
    const inserted: any[] = [];
    const result = await runWhatsappHealthSnapshot(
      makePorts({ insertSnapshot: async (row) => { inserted.push(row); } }),
    );

    expect(result).toEqual({ instances: 2, snapshots: 2, failures: 0 });
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({ tenant_id: 't1', instance_id: 'inst-a', risk_level: 'warning' });
    expect(inserted[1]).toMatchObject({ tenant_id: 't2', instance_id: 'inst-b' });
  });

  it('fail-open: falha de UMA instância não derruba o snapshot das outras', async () => {
    const inserted: any[] = [];
    const result = await runWhatsappHealthSnapshot(
      makePorts({
        computeStats: async (tenantId) => {
          if (tenantId === 't1') throw new Error('redis down');
          return { ban_signals: 0, is_paused: false, daily_messages_today: 0, messages_in_queue: 0 };
        },
        insertSnapshot: async (row) => { inserted.push(row); },
      }),
    );

    expect(result).toEqual({ instances: 2, snapshots: 1, failures: 1 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].tenant_id).toBe('t2');
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', instanceId: 'inst-a' }),
      expect.stringContaining('whatsapp-health-snapshot'),
    );
  });

  it('falha no insert de uma instância também é fail-open', async () => {
    const result = await runWhatsappHealthSnapshot(
      makePorts({
        insertSnapshot: async (row) => {
          if (row.tenant_id === 't2') throw new Error('postgrest down');
        },
      }),
    );

    expect(result).toEqual({ instances: 2, snapshots: 1, failures: 1 });
  });

  it('sem instâncias → rodada vazia, sem falhas', async () => {
    const result = await runWhatsappHealthSnapshot(makePorts({ listInstances: async () => [] }));
    expect(result).toEqual({ instances: 0, snapshots: 0, failures: 0 });
  });

  it('falha ao LISTAR instâncias propaga (job inteiro falha → BullMQ retenta)', async () => {
    await expect(
      runWhatsappHealthSnapshot(makePorts({
        listInstances: async () => { throw new Error('supabase down'); },
      })),
    ).rejects.toThrow('supabase down');
  });
});
