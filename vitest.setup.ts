import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

if (typeof (globalThis as any).fetch === 'undefined') {
  (globalThis as any).fetch = vi.fn();
}
