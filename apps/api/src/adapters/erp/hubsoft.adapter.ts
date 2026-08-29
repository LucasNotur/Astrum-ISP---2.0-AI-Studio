import type { ERPProvider, ERPCredentials, HttpClient, SecondCopyResult, ConnectionStatus } from './erp.types';
import { parseAmountToCents, normalizeErpBaseUrl, readErpErrorBody, ERP_HTTP_TIMEOUT_MS } from './erp.types';

/**
 * P0-05 — Hubsoft adapter.
 *
 * Hubsoft usa autenticação Bearer via token de acesso. Os endpoints seguem a
 * API REST do Hubsoft (ISP Manager). Integração com módulo financeiro e
 * controle de conexão via ONU/OLT.
 * HTTP injetável para teste.
 *
 * ⚠️ Auditoria 2026-08-28: o adapter assume um token Bearer estático e pronto
 * (vindo de `creds.token`). A API real do Hubsoft usa OAuth2 (obtido via
 * `/oauth/token`, com expiração) — não há fluxo de obtenção/renovação aqui.
 * Não implementado nesta rodada por incerteza sobre o grant_type exato
 * (password vs client_credentials, depende da versão) — validar contra doc
 * oficial/instância real antes de codar (ver CHECKLIST_PENDENCIAS_EXTERNAS.md).
 */
export class HubsoftAdapter implements ERPProvider {
  readonly name = 'hubsoft' as const;

  private readonly baseUrl: string;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token) throw new Error('Hubsoft: credenciais ausentes (url + token)');
    this.baseUrl = normalizeErpBaseUrl(creds.url);
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.creds.token}`,
    };
  }

  private async get(path: string) {
    const res = await this.http(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`Hubsoft API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    return res.json();
  }

  private async post(path: string, body: unknown) {
    const res = await this.http(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`Hubsoft API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    return res.json();
  }

  async findCustomerByCpf(cpf: string) {
    const clean = cpf.replace(/\D/g, '');
    return this.get(`/api/v1/clientes?cpf_cnpj=${clean}&per_page=5`);
  }

  async getBillingStatus(customerId: string) {
    return this.get(`/api/v1/financeiro/cobrancas?cliente_id=${customerId}&status=pendente&per_page=10`);
  }

  async generateSecondCopy(customerId: string, invoiceId: string): Promise<SecondCopyResult> {
    const data = await this.post(`/api/v1/financeiro/cobrancas/${invoiceId}/segunda-via`, {
      cliente_id: customerId,
    });
    return {
      boletoUrl: data?.boleto?.url ?? data?.url ?? '',
      pixCopiaCola: data?.pix?.copia_cola ?? data?.pix ?? '',
      barcode: data?.boleto?.linha_digitavel ?? data?.codigo_barras ?? '',
      dueDate: data?.data_vencimento ?? data?.vencimento ?? '',
      amountCents: parseAmountToCents(data?.valor ?? data?.amount ?? '0'),
    };
  }

  async getConnectionStatus(customerId: string): Promise<ConnectionStatus> {
    const data = await this.get(`/api/v1/clientes/${customerId}/conexao`);
    const online = data?.ativo === true || data?.status === 'ativo' || data?.conectado === true;
    return { online, raw: data };
  }

  async unlockCustomer(customerId: string) {
    return this.post(`/api/v1/clientes/${customerId}/desbloquear`, { tipo: 'confianca' });
  }
}
