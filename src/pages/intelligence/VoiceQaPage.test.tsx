import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('recharts', () => ({
  RadarChart: ({ children }: any) => <div data-testid="radar-chart">{children}</div>,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
  Radar: () => null,
  ResponsiveContainer: ({ children }: any) => <div data-testid="recharts-mock">{children}</div>,
}));

const mockFlags = vi.fn();
vi.mock('@/src/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => mockFlags(),
}));

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'tok' } } }) },
  },
}));

const mockResponse = vi.fn();

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => mockResponse(),
  })) as any;
  mockFlags.mockReturnValue({ flags: { voiceqa: true }, isLoading: false });
  mockResponse.mockReturnValue({ calls: [] });
});
afterEach(() => { globalThis.fetch = originalFetch; });

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

async function renderPage() {
  const { VoiceQaPage } = await import('./VoiceQaPage');
  return render(<VoiceQaPage />, { wrapper });
}

describe('VoiceQaPage', () => {
  it('renders the title', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Qualidade de Voz')).toBeInTheDocument();
    });
  });

  it('shows empty state when no calls', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Nenhuma chamada analisada.')).toBeInTheDocument();
    });
  });

  it('shows flag-off message when voiceqa flag is off', async () => {
    mockFlags.mockReturnValue({ flags: { voiceqa: false }, isLoading: false });
    await renderPage();
    expect(screen.getByText(/VOICE_QA_ENABLED/)).toBeInTheDocument();
  });

  it('renders stat cards with data', async () => {
    mockResponse.mockReturnValue({
      calls: [
        { id: 'c1', phoneLast4: '1234', startedAt: '2026-07-08T10:00:00Z', durationS: 180, status: 'completed', scorecard: { total: 85, criteria: [] } },
      ],
    });
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Chamadas analisadas')).toBeInTheDocument();
    });
  });
});
