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

import { sendContract, buildContractBase64, type ContractRequest, type ContractHttpClient } from './contract.service';

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

// Sequência de respostas OK dos 3 passos de cada provedor.
function clicksignOkHttp(): ContractHttpClient {
  return {
    post: vi.fn()
      .mockResolvedValueOnce({ ok: true, data: { document: { key: 'doc-abc-123' } } }) // /documents
      .mockResolvedValueOnce({ ok: true, data: { signer: { key: 'signer-xyz' } } })    // /signers
      .mockResolvedValueOnce({ ok: true, data: { list: { request_signature_key: 'req-sign-789' } } }), // /lists
  };
}
function d4signOkHttp(): ContractHttpClient {
  return {
    post: vi.fn()
      .mockResolvedValueOnce({ ok: true, data: { uuid: 'uuid-d4-456' } }) // upload
      .mockResolvedValueOnce({ ok: true, data: { message: 'ok' } })        // createlist
      .mockResolvedValueOnce({ ok: true, data: { message: 'sent' } }),     // sendtosigner
  };
}

describe('sendContract', () => {
  beforeEach(() => {
    storedIntegrationKeys = null;
    process.env.ERP_CRED_KEY = '0'.repeat(64);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('SaaS multi-tenant: chave do tenant tem prioridade sobre o env global', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', 'cs-global-astrum');
    storedIntegrationKeys = { clicksignApiKey: encryptString('cs-proprio-do-tenant') };

    const http = clicksignOkHttp();
    await sendContract(BASE_REQ, http);

    // 1º passo (criação do documento) já usa a chave do tenant, não a global.
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('access_token=cs-proprio-do-tenant'),
      expect.objectContaining({ document: expect.any(Object) }),
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

  it('Clicksign: faz /documents → /signers → /lists e devolve sent com externalKey = document key', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', 'cs-test-key');
    vi.stubEnv('D4SIGN_API_KEY', '');

    const http = clicksignOkHttp();
    const result = await sendContract(BASE_REQ, http);

    // Sequência de 3 chamadas, na ordem certa.
    const urls = (http.post as any).mock.calls.map((c: any[]) => c[0]);
    expect(urls[0]).toContain('/documents');
    expect(urls[1]).toContain('/signers');
    expect(urls[2]).toContain('/lists');
    // Payload da lista vincula documento + signatário criados nos passos anteriores.
    const listPayload = (http.post as any).mock.calls[2][1];
    expect(listPayload.list.document_key).toBe('doc-abc-123');
    expect(listPayload.list.signer_key).toBe('signer-xyz');

    expect(result.status).toBe('sent');
    expect(result.provider).toBe('clicksign');
    expect(result.externalKey).toBe('doc-abc-123');           // pra reconciliar webhook
    expect(result.contractUrl).toContain('req-sign-789');      // URL da request_signature_key
  });

  it('Clicksign: CPF/telefone vão sem máscara no signatário', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', 'cs-test-key');
    vi.stubEnv('D4SIGN_API_KEY', '');

    const http = clicksignOkHttp();
    await sendContract(BASE_REQ, http);

    const signerPayload = (http.post as any).mock.calls[1][1];
    expect(signerPayload.signer.documentation).toBe('12345678900');
    expect(signerPayload.signer.phone_number).toBe('11999999999');
  });

  it('Clicksign: falha num passo intermediário → failed, não segue para os próximos', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', 'cs-test-key');
    vi.stubEnv('D4SIGN_API_KEY', '');

    const http: ContractHttpClient = {
      post: vi.fn()
        .mockResolvedValueOnce({ ok: true, data: { document: { key: 'doc-1' } } })
        .mockResolvedValueOnce({ ok: false, data: null }), // /signers falha
    };
    const result = await sendContract(BASE_REQ, http);

    expect(result.status).toBe('failed');
    expect(result.provider).toBe('clicksign');
    expect(http.post).toHaveBeenCalledTimes(2); // parou no /signers, não chamou /lists
  });

  it('Clicksign: fallback de URL quando a lista não devolve request_signature_key', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', 'cs-test-key');
    vi.stubEnv('D4SIGN_API_KEY', '');

    const http: ContractHttpClient = {
      post: vi.fn()
        .mockResolvedValueOnce({ ok: true, data: { document: { key: 'doc-1' } } })
        .mockResolvedValueOnce({ ok: true, data: { signer: { key: 'signer-1' } } })
        .mockResolvedValueOnce({ ok: true, data: { list: {} } }), // sem request_signature_key
    };
    const result = await sendContract(BASE_REQ, http);

    expect(result.status).toBe('sent');
    expect(result.contractUrl).toContain('documents/doc-1'); // fallback pela key do documento
  });

  it('D4Sign: faz upload → createlist → sendtosigner e devolve sent com externalKey = uuid', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', '');
    vi.stubEnv('D4SIGN_API_KEY', 'd4-test-key');

    const http = d4signOkHttp();
    const result = await sendContract(BASE_REQ, http);

    const urls = (http.post as any).mock.calls.map((c: any[]) => c[0]);
    expect(urls[0]).toContain('/documents/upload');
    expect(urls[1]).toContain('/documents/uuid-d4-456/createlist');   // uuid do upload na URL
    expect(urls[2]).toContain('/documents/uuid-d4-456/sendtosigner');

    expect(result.status).toBe('sent');
    expect(result.provider).toBe('d4sign');
    expect(result.externalKey).toBe('uuid-d4-456');
    expect(result.contractUrl).toContain('uuid-d4-456');
  });

  it('D4Sign: sem uuid no upload → failed, não chama createlist', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', '');
    vi.stubEnv('D4SIGN_API_KEY', 'd4-test-key');

    const http: ContractHttpClient = {
      post: vi.fn().mockResolvedValueOnce({ ok: true, data: {} }), // upload sem uuid
    };
    const result = await sendContract(BASE_REQ, http);

    expect(result.status).toBe('failed');
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('retorna failed quando o provedor lança exceção', async () => {
    vi.stubEnv('CLICKSIGN_API_KEY', '');
    vi.stubEnv('D4SIGN_API_KEY', 'd4-test-key');

    const http: ContractHttpClient = {
      post: vi.fn().mockRejectedValue(new Error('network error')),
    };
    const result = await sendContract(BASE_REQ, http);

    expect(result.status).toBe('failed');
    expect(result.message).toContain('network error');
  });
});

describe('buildContractBase64 — PDF real (Fase A)', () => {
  const decode = (b64: string) => Buffer.from(b64, 'base64');

  it('gera um PDF estruturalmente VÁLIDO (header, xref, trailer, EOF)', () => {
    const b64 = buildContractBase64(BASE_REQ);
    const buf = decode(b64);
    const head = buf.subarray(0, 8).toString('latin1');
    const tail = buf.subarray(-2048).toString('latin1');

    expect(head.startsWith('%PDF-')).toBe(true);   // era o placeholder inválido antes
    expect(tail).toContain('xref');
    expect(tail).toContain('trailer');
    expect(tail).toContain('%%EOF');
    expect(buf.length).toBeGreaterThan(1000);       // não é mais um stub de 1 linha
  });

  it('é determinístico o suficiente pra não quebrar com dados variados (não lança)', () => {
    expect(() => buildContractBase64({
      ...BASE_REQ,
      signerName: 'Maria de Fátima da Conceição Albuquerque',
      address: 'Avenida Presidente Getúlio Vargas, 1500, apto 302, Bairro Novo, Belo Horizonte - MG, 30110-000',
      planName: 'Ultra 1 Giga + Streaming',
      planPriceCents: 19990,
    })).not.toThrow();
  });
});
