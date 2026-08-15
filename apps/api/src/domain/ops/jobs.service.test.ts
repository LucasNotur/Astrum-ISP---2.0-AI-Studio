import { describe, it, expect } from 'vitest';
import { buildCsatJob, JobValidationError } from './jobs.service';

describe('buildCsatJob', () => {
  it('ok monta payload com tenant do arg', () => {
    const job = buildCsatJob(
      { ticketId: 123, customerId: 'c1', category: 'SAC_TECNICO', resolved_by: 'human' },
      'tenant-x',
    );
    expect(job.tenantId).toBe('tenant-x');
    expect(job.delayMs).toBe(60 * 1000);
    expect(job.jobName).toBe('send_csat');
    expect(job.payload).toEqual({
      ticketId: '123',
      tenantId: 'tenant-x',
      customerId: 'c1',
      category: 'SAC_TECNICO',
      resolved_by: 'human',
    });
  });

  it('sem ticketId lança JobValidationError', () => {
    expect(() => buildCsatJob({ customerId: 'c1' }, 'tenant-x')).toThrow(JobValidationError);
  });

  it('sem tenant lança JobValidationError', () => {
    expect(() => buildCsatJob({ ticketId: 1 }, '')).toThrow(JobValidationError);
  });

  it('resolved_by diferente de human vira bot', () => {
    const job = buildCsatJob({ ticketId: 1, resolved_by: 'bot' }, 'tenant-x');
    expect(job.payload.resolved_by).toBe('bot');
    const job2 = buildCsatJob({ ticketId: 1, resolved_by: 'qualquer' }, 'tenant-x');
    expect(job2.payload.resolved_by).toBe('bot');
  });
});
