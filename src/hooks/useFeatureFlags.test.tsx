import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFeatureFlags } from './useFeatureFlags';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useFeatureFlags', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('retorna flags quando a API responde', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ flags: { hub: true } }),
    });

    const { result } = renderHook(() => useFeatureFlags(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.flags).toEqual({ hub: true });
  });

  it('retorna objeto vazio em caso de erro (fail-closed)', async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useFeatureFlags(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.flags).toEqual({});
  });

  it('retorna objeto vazio quando a resposta não é ok', async () => {
    (globalThis.fetch as any).mockResolvedValue({ ok: false });

    const { result } = renderHook(() => useFeatureFlags(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.flags).toEqual({});
  });
});
