import type { ERPProvider, ERPCredentials, HttpClient, SecondCopyResult, ConnectionStatus } from './erp.types';
import { parseAmountToCents } from './erp.types';

/**
 * P0-05 — Hubsoft adapter.
 *
 * Hubsoft usa autenticação Bearer via token de acesso. Os endpoints seguem a
 * API REST do Hubsoft (ISP Manager). Integração com módulo financeiro e
 * controle de conexão via ONU/OLT.
 * HTTP injetável para teste.
 */
export class HubsoftAdapter implements ERPProvider {
  readonly name = 'hubsoft' as const;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token) throw new Error('Hubsoft: credenciais ausentes (url + token)');
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.creds.token}`,
    };
  }

  private async get(path: string) {
    const res = await this.http(`${this.creds.url}${path}`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Hubsoft API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  private async post(path: string, body: unknown) {
    const res = await this.http(`${this.creds.url}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Hubsoft API Error: ${res.status} ${res.statusText}`);
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
