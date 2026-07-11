import { describe, it, expect, vi } from 'vitest';
import { notifyMassOutage, type OutageNotifierDb, type NotifySendFn } from './outage-notifier.service';

function makeDb(customers: Array<{ id: string; phone?: string; whatsapp_number?: string }>, insertError = false): OutageNotifierDb {
  return {
    from: vi.fn((table: string) => {
      if (table === 'customers') {
        const chainFn = vi.fn().mockReturnValue({
          eq: chainFn,
          limit: vi.fn().mockResolvedValue({ data: customers, error: null }),
        });
        return { select: () => ({ eq: chainFn }) };
      }
      if (table === 'outage_notifications') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: insertError ? null : { id: 'outage-1' },
                error: insertError ? { message: 'err' } : null,
              }),
            }),
          }),
        };
      }
      return {};
    }),
  } as unknown as OutageNotifierDb;
}

function makeDbSimple(
  customers: Array<{ id: string; phone?: string; whatsapp_number?: string }>,
): OutageNotifierDb {
  return {
    from: (table: string) => {
      if (table === 'customers') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => Promise.resolve({ data: customers, error: null }),
              }),
            }),
          }),
        };
      }
      return {
        insert: () => ({
          select: () => ({ single: () => Promise.resolve({ data: { id: 'outage-1' }, error: null }) }),
        }),
      };
    },
  } as unknown as OutageNotifierDb;
}

describe('notifyMassOutage (P1-02)', () => {
  it('envia para todos os clientes com telefone e retorna contagem correta', async () => {
    const customers = [
      { id: 'c1', phone: '11999991111' },
      { id: 'c2', whatsapp_number: '11999992222' },
      { id: 'c3' }, // sem telefone → failed
    ];
    const db = makeDbSimple(customers);
    const send: NotifySendFn = vi.fn().mockResolvedValue(undefined);

    const result = await notifyMassOutage(db, send, {
      tenantId: 't1',
      message: 'Falha identificada na sua região.',
    });

    expect(result.notified).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.totalAffected).toBe(3);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('prefere whatsapp_number ao phone quando ambos existem', async () => {
    const customers = [{ id: 'c1', phone: '11000000000', whatsapp_number: '11999999999' }];
    const db = makeDbSimple(customers);
    const send: NotifySendFn = vi.fn().mockResolvedValue(undefined);

    await notifyMassOutage(db, send, { tenantId: 't1', message: 'Alerta.' });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: '11999999999' }),
    );
  });

  it('contabiliza failed quando o envio lança erro', async () => {
    const customers = [{ id: 'c1', phone: '11111111111' }];
    const db = makeDbSimple(customers);
    const send: NotifySendFn = vi.fn().mockRejectedValue(new Error('timeout'));

    const result = await notifyMassOutage(db, send, { tenantId: 't1', message: 'Falha.' });
    expect(result.notified).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('lança erro quando a query de clientes falha', async () => {
    const db: OutageNotifierDb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => Promise.resolve({ data: null, error: { message: 'db error' } }),
            }),
          }),
        }),
      }),
    } as unknown as OutageNotifierDb;

    const send: NotifySendFn = vi.fn();
    await expect(
      notifyMassOutage(db, send, { tenantId: 't1', message: 'x' }),
    ).rejects.toThrow('Não foi possível buscar clientes afetados');
  });

  it('retorna outageId gerado automaticamente quando insert não retorna id', async () => {
    const customers = [{ id: 'c1', phone: '11111111111' }];
    const db: OutageNotifierDb = {
      from: (table: string) => {
        if (table === 'customers') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ limit: () => Promise.resolve({ data: customers, error: null }) }),
              }),
            }),
          };
        }
        return {
          insert: () => ({
            select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
          }),
        };
      },
    } as unknown as OutageNotifierDb;

    const send: NotifySendFn = vi.fn().mockResolvedValue(undefined);
    const result = await notifyMassOutage(db, send, { tenantId: 't1', message: 'y' });
    expect(result.outageId).toMatch(/[0-9a-f-]{36}/);
  });
});
