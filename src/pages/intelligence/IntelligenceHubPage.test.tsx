import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import IntelligenceHubPage, { BRANCH_REGISTRY } from './IntelligenceHubPage';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('IntelligenceHubPage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renderiza título e EmptyState quando nenhuma flag está ligada', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ flags: {} }),
    });

    render(<IntelligenceHubPage />, { wrapper });

    expect(await screen.findByText('Central de Inteligência')).toBeInTheDocument();
    expect(
      await screen.findByText('Nenhum módulo de inteligência ativo neste ambiente.'),
    ).toBeInTheDocument();
  });

  it('mostra cards dos módulos cujas flags estão ligadas', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ flags: { toolreg: true, safety: true } }),
    });

    render(<IntelligenceHubPage />, { wrapper });

    expect(await screen.findByText('Ferramentas do Agente')).toBeInTheDocument();
    expect(await screen.findByText('Guardrails')).toBeInTheDocument();
    expect(screen.queryByText('Grafo da Rede')).not.toBeInTheDocument();
  });

  it('BRANCH_REGISTRY cobre as chaves esperadas', () => {
    const keys = BRANCH_REGISTRY.map((b) => b.key);
    expect(keys).toContain('toolreg');
    expect(keys).toContain('safety');
    expect(keys).toContain('graphrag');
  });
});
