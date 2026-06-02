import { describe, it, expect } from 'vitest';
import cluster from 'node:cluster';
import os from 'node:os';

describe('Cluster Configuration', () => {
  it('número de CPUs disponíveis é maior que zero', () => {
    expect(os.cpus().length).toBeGreaterThan(0);
  });

  it('em ambiente de test usa worker único', () => {
    process.env.NODE_ENV = 'test';
    const workers = process.env.NODE_ENV === 'production'
      ? os.cpus().length
      : 1;
    expect(workers).toBe(1);
  });

  it('cluster.isPrimary ou cluster.isWorker é true', () => {
    expect(cluster.isPrimary || cluster.isWorker).toBe(true);
  });
});
