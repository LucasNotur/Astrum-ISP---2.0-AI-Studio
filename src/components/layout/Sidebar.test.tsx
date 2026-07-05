import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAppStore } from '@/src/store/useAppStore';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('Sidebar — seção Inteligência', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('flag off: não renderiza "Central de Inteligência"', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ flags: {} }),
    });

    render(<Sidebar />, { wrapper });

    // aguarda fetch resolver
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Central de Inteligência')).not.toBeInTheDocument();
  });

  it('flag on + acesso: renderiza e navega para /intelligence', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ flags: { hub: true } }),
    });

    useAppStore.getState().setCurrentUserRole('admin');

    render(<Sidebar />, { wrapper });

    const item = await screen.findByText('Central de Inteligência');
    expect(item).toBeInTheDocument();
  });
});
