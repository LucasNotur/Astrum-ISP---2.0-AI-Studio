import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getERPAdapter, IXCAdapter, MKAuthAdapter } from '../../../lib/integrations/erpAdapter';

describe('ERP Adapter Tests', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const config = { baseUrl: 'http://test', token: 'token' };

  it('1. getERPAdapter com erp_type=ixc -> retorna instância de IXCAdapter', () => {
    const adapter = getERPAdapter('ixc', config);
    expect(adapter).toBeInstanceOf(IXCAdapter);
  });

  it('2. getERPAdapter com erp_type=mkauth -> retorna instância de MKAuthAdapter', () => {
    const adapter = getERPAdapter('mkauth', config);
    expect(adapter).toBeInstanceOf(MKAuthAdapter);
  });

  it('3. getERPAdapter sem ERP configurado -> lança ERP_NOT_CONFIGURED', () => {
    expect(() => getERPAdapter(undefined, config)).toThrow('ERP_NOT_CONFIGURED');
    expect(() => getERPAdapter('other', config)).toThrow('ERP_NOT_CONFIGURED');
  });

  it('4. IXCAdapter.getBillingStatus -> chama endpoint correto do IXC', async () => {
    const mockReponse = {
      razao: 'Cliente IXC',
      has_overdue: true,
      pix_code: 'ixc_pix',
      boleto_url: 'ixc_boleto',
      status: 'ativo'
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockReponse
    });

    const adapter = new IXCAdapter(config);
    await adapter.getBillingStatus('123');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test/cliente?qtype=cnpj_cpf&query=123',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Basic token' }) })
    );
  });

  it('5. MKAuthAdapter.getBillingStatus -> chama endpoint correto do MK-Auth', async () => {
    const mockReponse = {
      nome: 'Cliente MKAuth',
      tem_atraso: false,
      codigo_pix: 'mk_pix',
      url_boleto: 'mk_boleto',
      situacao: 'bloqueado'
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockReponse
    });

    const adapter = new MKAuthAdapter(config);
    await adapter.getBillingStatus('456');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test/api/cliente?cpfcnpj=456',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) })
    );
  });

  it('6. SCHEMA: ambos os adapters retornam exatamente os mesmos campos', async () => {
    const mockIxcReponse = {
      razao: 'Cliente IXC',
      has_overdue: true,
      pix_code: 'ixc_pix',
      boleto_url: 'ixc_boleto',
      status: 'ativo'
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockIxcReponse
    });
    const ixcAdapter = new IXCAdapter(config);
    const ixcStatus = await ixcAdapter.getBillingStatus('123');

    const mockMkAuthReponse = {
      nome: 'Cliente MKAuth',
      tem_atraso: false,
      codigo_pix: 'mk_pix',
      url_boleto: 'mk_boleto',
      situacao: 'bloqueado'
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockMkAuthReponse
    });
    const mkauthAdapter = new MKAuthAdapter(config);
    const mkauthStatus = await mkauthAdapter.getBillingStatus('456');

    // Both should match the exact schema
    expect(Object.keys(ixcStatus)).toEqual(
      expect.arrayContaining(['customer_name', 'has_overdue', 'pix_code', 'boleto_url', 'status'])
    );
    expect(Object.keys(mkauthStatus)).toEqual(
      expect.arrayContaining(['customer_name', 'has_overdue', 'pix_code', 'boleto_url', 'status'])
    );

    expect(ixcStatus).toEqual({
      customer_name: 'Cliente IXC',
      has_overdue: true,
      pix_code: 'ixc_pix',
      boleto_url: 'ixc_boleto',
      status: 'ativo'
    });

    expect(mkauthStatus).toEqual({
      customer_name: 'Cliente MKAuth',
      has_overdue: false,
      pix_code: 'mk_pix',
      boleto_url: 'mk_boleto',
      status: 'bloqueado'
    });
  });

  it('7. ERP retorna 503 -> adapter lança ERP_UNAVAILABLE (não expõe erro interno)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Internal DB dead' })
    });

    const ixcAdapter = new IXCAdapter(config);
    await expect(ixcAdapter.getBillingStatus('123')).rejects.toThrow('ERP_UNAVAILABLE');

    const mkauthAdapter = new MKAuthAdapter(config);
    await expect(mkauthAdapter.getBillingStatus('456')).rejects.toThrow('ERP_UNAVAILABLE');
  });
  
  it('7.2. fetch falha por networking -> adapter lança ERP_UNAVAILABLE', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNREFUSED'));

    const ixcAdapter = new IXCAdapter(config);
    await expect(ixcAdapter.getBillingStatus('123')).rejects.toThrow('ERP_UNAVAILABLE');
  });
});
