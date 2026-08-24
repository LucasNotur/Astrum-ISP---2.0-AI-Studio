import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encryptString } from '../../adapters/erp/credential-cipher';

// sendContract resolve a chave via resolveTenantContractKeys → tenant-keys.ts →
// Supabase. Sem tenant configurado (caso default aqui), cai pro env global —
// preserva o comportamento dos testes existentes, que testam só a env.
let storedIntegrationKeys: Record<string, string> | null = null;
vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: storedIntegrationKeys ? { integration_keys: storedIntegrationKeys } : null })),
    })),
  },
}));

import { sendContract, type ContractRequest, type ContractHttpClient } from './contract.service';

const BASE_REQ: ContractRequest = {
  tenantId: 't1',
  leadId: 'lead-1',
  signerName: 'João Silva',
  signerCpf: '123.456.789-00',
  signerEmail: 'joao@example.com',
  signerPhone: '11999999999',
  address: 'Rua A, 1, Centro, SP',
  planName: 'Pro 300 Mbps',
  planPriceCents: 12990,
};

describe('sendContract', () => {
  beforeEach(() => {
    storedIntegrationKeys = null;
    process.env.ERP_CRED_KEY = '0'.repeat(64);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('SaaS multi-tenant: chave do tenant tem prioridade sobre o env global', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', 'cs-global-astrum');
    storedIntegrationKeys = { clicksignApiKey: encryptString('cs-proprio-do-tenant') };

    const fakeHttp: ContractHttpClient = {
      post: vi.fn().mockResolvedValue({ ok: true, data: { document: { key: 'doc-1' } } }),
    };
    await sendContract(BASE_REQ, fakeHttp);

    expect(fakeHttp.post).toHaveBeenCalledWith(
      expect.stringContaining('access_token=cs-proprio-do-tenant'),
      expect.any(Object),
      {},
    );
  });

  it('retorna pending_signature quando nenhuma chave configurada', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', '');
    vi.stubEnv('D4SIGN_API_KEY', '');

    const result = await sendContract(BASE_REQ);

    expect(result.status).toBe('pending_signature');
    expect(result.provider).toBe('none');
  });

  it('usa Clicksign quando CLICKSIGN_API_KEY presente e HTTP OK', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', 'cs-test-key');
    vi.stubEnv('D4SIGN_API_KEY', '');

    const fakeHttp: ContractHttpClient = {
      post: vi.fn().mockResolvedValue({
        ok: true,
        data: { document: { key: 'doc-abc-123' } },
      }),
    };

    const result = await sendContract(BASE_REQ, fakeHttp);

    expect(result.status).toBe('sent');
    expect(result.provider).toBe('clicksign');
    expect(result.contractUrl).toContain('doc-abc-123');
    expect(fakeHttp.post).toHaveBeenCalledWith(
      expect.stringContaining('clicksign'),
      expect.objectContaining({ document: expect.any(Object) }),
      {},
    );
  });

  it('retorna failed quando Clicksign HTTP não-ok', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', 'cs-test-key');
    vi.stubEnv('D4SIGN_API_KEY', '');

    const fakeHttp: ContractHttpClient = {
      post: vi.fn().mockResolvedValue({ ok: false, data: null }),
    };

    const result = await sendContract(BASE_REQ, fakeHttp);

    expect(result.status).toBe('failed');
    expect(result.provider).toBe('clicksign');
  });

  it('usa D4Sign quando somente D4SIGN_API_KEY presente e HTTP OK', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', '');
    vi.stubEnv('D4SIGN_API_KEY', 'd4-test-key');

    const fakeHttp: ContractHttpClient = {
      post: vi.fn().mockResolvedValue({
        ok: true,
        data: { uuid: 'uuid-d4-456' },
      }),
    };

    const result = await sendContract(BASE_REQ, fakeHttp);

    expect(result.status).toBe('sent');
    expect(result.provider).toBe('d4sign');
    expect(result.contractUrl).toContain('uuid-d4-456');
  });

  it('retorna failed quando D4Sign lança exceção', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', '');
    vi.stubEnv('D4SIGN_API_KEY', 'd4-test-key');

    const fakeHttp: ContractHttpClient = {
      post: vi.fn().mockRejectedValue(new Error('network error')),
    };

    const result = await sendContract(BASE_REQ, fakeHttp);

    expect(result.status).toBe('failed');
    expect(result.message).toContain('network error');
  });
});
