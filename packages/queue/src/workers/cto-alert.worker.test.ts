import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.CTO_ALERT_ENABLED;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('CTO alert flag', () => {
  it('is disabled by default', () => {
    const isEnabled = (process.env.CTO_ALERT_ENABLED ?? '').trim().toLowerCase() === 'true';
    expect(isEnabled).toBe(false);
  });

  it('is enabled when env set', () => {
    process.env.CTO_ALERT_ENABLED = 'true';
    const isEnabled = (process.env.CTO_ALERT_ENABLED ?? '').trim().toLowerCase() === 'true';
    expect(isEnabled).toBe(true);
  });
});

describe('metrics ingest schema', () => {
  it('accepts valid metric point', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      cto_id: z.string().uuid(),
      metric: z.enum(['latency_ms', 'packet_loss_pct', 'signal_dbm', 'clients_online']),
      value: z.number(),
    });
    const result = schema.safeParse({
      cto_id: '550e8400-e29b-41d4-a716-446655440000',
      metric: 'packet_loss_pct',
      value: 3.5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid metric type', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      metric: z.enum(['latency_ms', 'packet_loss_pct', 'signal_dbm', 'clients_online']),
    });
    const result = schema.safeParse({ metric: 'invalid' });
    expect(result.success).toBe(false);
  });
});
