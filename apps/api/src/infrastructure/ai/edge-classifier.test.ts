import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEdgeMode, messageHash } from './edge-classifier';

describe('edge-classifier', () => {
  beforeEach(() => {
    delete (process.env as any).EDGE_INFERENCE_MODE;
  });

  it('getEdgeMode returns off by default', () => {
    expect(getEdgeMode()).toBe('off');
  });

  it('getEdgeMode returns shadow when set', () => {
    process.env.EDGE_INFERENCE_MODE = 'shadow';
    expect(getEdgeMode()).toBe('shadow');
  });

  it('messageHash returns consistent hash without PII', () => {
    const h1 = messageHash('test message');
    const h2 = messageHash('test message');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(32);
    expect(h1).not.toContain('test');
  });

  it('messageHash produces different hashes for different messages', () => {
    expect(messageHash('a')).not.toBe(messageHash('b'));
  });
});
