import { vi, beforeEach } from 'vitest';

// Mock global fetch para testes de apps/api.
global.fetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});
