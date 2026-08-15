import { describe, it, expect } from 'vitest';
import { filterTenantCobraiJobs, countCobraiByStatus } from './queue-monitor.service';

describe('filterTenantCobraiJobs', () => {
  it('mantém só os jobs do tenant certo', () => {
    const raw = [
      { id: '1', name: 'cobrar', data: { tenantId: 't1', customerId: 'c1' } },
      { id: '2', name: 'cobrar', data: { tenantId: 't2', customerId: 'c2' } },
      { id: '3', name: 'cobrar', data: { tenantId: 't1', customerId: 'c3' } },
    ];
    const out = filterTenantCobraiJobs(raw, 't1', () => 'waiting');
    expect(out).toHaveLength(2);
    expect(out.map(j => j.id)).toEqual(['1', '3']);
  });

  it('job sem data.tenantId é descartado', () => {
    const raw = [
      { id: '1', name: 'a', data: { tenantId: 't1' } },
      { id: '2', name: 'b', data: {} },
      { id: '3', name: 'c' },
    ];
    const out = filterTenantCobraiJobs(raw, 't1', () => 'waiting');
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('1');
  });

  it('mapeia id/name/status via stateOf', () => {
    const raw = [{ id: '9', name: 'send', data: { tenantId: 't1' } }];
    const out = filterTenantCobraiJobs(raw, 't1', () => 'waiting');
    expect(out).toEqual([{ id: '9', name: 'send', data: { tenantId: 't1' }, status: 'waiting' }]);
  });
});

describe('countCobraiByStatus', () => {
  it('conta certo por status', () => {
    const jobs = [
      { id: '1', name: 'a', data: {}, status: 'waiting' },
      { id: '2', name: 'b', data: {}, status: 'waiting' },
      { id: '3', name: 'c', data: {}, status: 'failed' },
      { id: '4', name: 'd', data: {}, status: 'completed' },
    ];
    expect(countCobraiByStatus(jobs)).toEqual({
      waiting: 2, active: 0, completed: 1, failed: 1, delayed: 0,
    });
  });

  it('status desconhecido não quebra (ignora)', () => {
    const jobs = [
      { id: '1', name: 'a', data: {}, status: 'paused' },
      { id: '2', name: 'b', data: {}, status: 'waiting' },
    ];
    expect(countCobraiByStatus(jobs)).toEqual({
      waiting: 1, active: 0, completed: 0, failed: 0, delayed: 0,
    });
  });
});
