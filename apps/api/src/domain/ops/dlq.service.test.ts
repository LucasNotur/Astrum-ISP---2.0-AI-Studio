import { describe, it, expect } from 'vitest';
import { resolveRetryTarget } from './dlq.service';

describe('resolveRetryTarget', () => {
  it('queue_name === cobrai → queue cobrai', () => {
    const t = resolveRetryTarget({ queue_name: 'cobrai', job_name: 'send_cobranca', payload: { a: 1 }, tenant_id: 't-1' });
    expect(t.queue).toBe('cobrai');
    expect(t.jobName).toBe('send_cobranca');
  });

  it('job_name contém "cobrai" → cobrai', () => {
    const t = resolveRetryTarget({ queue_name: 'messages-t-1', job_name: 'cobrai-check', payload: {}, tenant_id: 't-1' });
    expect(t.queue).toBe('cobrai');
  });

  it('senão → tenant', () => {
    const t = resolveRetryTarget({ queue_name: 'messages-t-1', job_name: 'process-message', payload: {}, tenant_id: 't-1' });
    expect(t.queue).toBe('tenant');
  });

  it('defaults: sem job_name → process-message, sem payload → {}', () => {
    const t = resolveRetryTarget({ queue_name: 'messages-t-1', tenant_id: 't-1' });
    expect(t.jobName).toBe('process-message');
    expect(t.payload).toEqual({});
    expect(t.tenantId).toBe('t-1');
  });
});
