import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ERPIntegrationsPage } from '../../pages/ERPIntegrationsPage';

// Achado colateral da F1-D2: a página inteira (loadAllCredentials/saveProvider/
// testProvider) chamava `fetch('/api/integrations/...')` — rota Express morta desde
// a Fase 4 (2026-08-17/18), 404 garantido. Estes testes cobrem o fix: as 3 operações
// agora passam pela rota real `apps/api` (`erp-admin.routes.ts`, já usada por
// SettingsPage.tsx para os mesmos 5 providers).

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
vi.mock('@/src/lib/apiClient', () => ({
  apiGet: (...args: any[]) => apiGetMock(...args),
  apiPost: (...args: any[]) => apiPostMock(...args),
}));

vi.mock('@/src/store/useAppStore', () => ({
  useAppStore: () => ({ user: { tenantId: 'tenant-1' } }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (...a: any[]) => toastSuccess(...a), error: (...a: any[]) => toastError(...a) } }));

async function openProviderCard(label: string) {
  // O label aparece 2x: no resumo de badges no topo e no título do card expansível
  // (CardTitle) — a segunda ocorrência é a clicável (CardHeader tem o onClick).
  const matches = await screen.findAllByText(label);
  fireEvent.click(matches[matches.length - 1]);
}

describe('ERPIntegrationsPage', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
    apiGetMock.mockResolvedValue({ credentials: [{ provider: 'ixc', active: true }] });
  });

  it('carrega status via GET /api/v2/erp/credentials (nunca /api/integrations)', async () => {
    render(<ERPIntegrationsPage />);
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith('/api/v2/erp/credentials'));
    expect(await screen.findByText('Conectado e ativo')).toBeInTheDocument();
  });

  it('Salvar credenciais chama POST /api/v2/erp/credentials com {provider, credentials, active} — sem tenantId no body', async () => {
    apiPostMock.mockResolvedValue({ ok: true });
    render(<ERPIntegrationsPage />);
    await openProviderCard('MKAuth');

    fireEvent.change(screen.getByPlaceholderText('https://mk.seudominio.com.br'), { target: { value: 'https://mk.example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Client_id gerado em Controle de usuários → API'), { target: { value: 'cid-1' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'segredo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar credenciais' }));

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith('/api/v2/erp/credentials', {
        provider: 'mkauth',
        credentials: { url: 'https://mk.example.com', clientId: 'cid-1', clientSecret: 'segredo' },
        active: true,
      }),
    );
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('Testar conexão chama POST /api/v2/erp/credentials/:provider/test (credencial já salva, sem reenviar os campos do form)', async () => {
    apiPostMock.mockResolvedValue({ ok: true });
    render(<ERPIntegrationsPage />);
    await openProviderCard('IXC Provedor');

    fireEvent.click(screen.getByRole('button', { name: 'Testar conexão' }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/api/v2/erp/credentials/ixc/test', {}));
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('erro no save (ex.: provider fora da allowlist) mostra toast de erro, não quebra a tela', async () => {
    apiPostMock.mockRejectedValue(new Error('provider inválido. Aceitos: ixc, mkauth, ...'));
    render(<ERPIntegrationsPage />);
    await openProviderCard('SGP');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar credenciais' }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
  });
});
