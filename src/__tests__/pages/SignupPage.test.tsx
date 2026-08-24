import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -- Mocks --------------------------------------------------------------------

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function mockFetch(data: object, ok = true, status = ok ? 201 : 400) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => data,
  } as any);
}

function fillForm() {
  fireEvent.change(screen.getByLabelText('Nome do provedor'), { target: { value: 'ISP Fibra Norte' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'contato@fibranorte.com.br' } });
  fireEvent.change(screen.getByLabelText(/Senha/), { target: { value: 'senhaSegura123' } });
}

// -- Tests --------------------------------------------------------------------

describe('SignupPage — P5-05 trial sem fricção', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the single-step signup form', async () => {
    const { SignupPage } = await import('@/src/pages/SignupPage');
    render(<MemoryRouter><SignupPage /></MemoryRouter>);

    expect(screen.getByText('Conecte em 15 minutos')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do provedor')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Criar conta/ })).toBeInTheDocument();
  });

  it('does not call the API when password is too short', async () => {
    mockFetch({});
    const { toast } = await import('sonner');
    const { SignupPage } = await import('@/src/pages/SignupPage');
    render(<MemoryRouter><SignupPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Nome do provedor'), { target: { value: 'ISP Fibra Norte' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'contato@fibranorte.com.br' } });
    fireEvent.change(screen.getByLabelText(/Senha/), { target: { value: 'curta' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar conta/ }));

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('8 caracteres'));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('calls POST /api/v2/trial/signup with the right payload and shows the success state', async () => {
    mockFetch({
      tenantId: 't1', trialId: 'tr1', token: 'jwt', expiresAt: '2026-09-01T00:00:00Z',
      trialDays: 14, nextStep: 'connect_erp', message: 'Trial de 14 dias ativo.',
    });
    const { SignupPage } = await import('@/src/pages/SignupPage');
    render(<MemoryRouter><SignupPage /></MemoryRouter>);

    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /Criar conta/ }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v2/trial/signup'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            ispName: 'ISP Fibra Norte',
            email: 'contato@fibranorte.com.br',
            password: 'senhaSegura123',
          }),
        }),
      );
    });

    // Regressão: a transição pro estado de sucesso precisa acontecer de fato —
    // achado real (2026-08-23) onde AnimatePresence mode="wait" deixava o botão
    // preso em "Criando conta…" para sempre mesmo com a chamada tendo sucesso.
    await waitFor(() => {
      expect(screen.getByText('Trial ativo, ISP Fibra Norte!')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Entrar agora' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do provedor')).not.toBeInTheDocument();
  });

  it('shows an error toast and resets the button when signup fails', async () => {
    const { toast } = await import('sonner');
    mockFetch({ error: 'E-mail já cadastrado. Use o login normal.' }, false, 409);
    const { SignupPage } = await import('@/src/pages/SignupPage');
    render(<MemoryRouter><SignupPage /></MemoryRouter>);

    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /Criar conta/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('E-mail já cadastrado. Use o login normal.');
    });
    // Não fica travado em "Criando conta…" depois do erro.
    expect(screen.getByRole('button', { name: /Criar conta/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Criar conta/ })).not.toBeDisabled();
  });
});
