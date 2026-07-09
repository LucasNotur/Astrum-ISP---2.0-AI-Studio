import type { ERPProvider, ERPCredentials, HttpClient, SecondCopyResult, ConnectionStatus } from './erp.types';
import { parseAmountToCents } from './erp.types';

/**
 * P0-04 — SGP/TSMX adapter.
 *
 * SGP usa autenticação via API Key no header `token`. Os endpoints seguem
 * o padrão REST do SGP 3.x. Integra OLT e gateways de pagamento (PIX nativo).
 * HTTP injetável para teste.
 */
export class SGPAdapter implements ERPProvider {
  readonly name = 'sgp' as const;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token) throw new Error('SGP: credenciais ausentes (url + token)');
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      token: this.creds.token,
    };
  }

  private async get(path: string) {
    const res = await this.http(`${this.creds.url}${path}`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`SGP API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  private async post(path: string, body: unknown) {
    const res = await this.http(`${this.creds.url}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`SGP API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async findCustomerByCpf(cpf: string) {
    const clean = cpf.replace(/\D/g, '');
    return this.get(`/api/v2/contratos?cpf=${clean}&limit=5`);
  }

  async getBillingStatus(customerId: string) {
    return this.get(`/api/v2/financeiro/faturas?contrato_id=${customerId}&status=pendente&limit=10`);
  }

  async generateSecondCopy(customerId: string, invoiceId: string): Promise<SecondCopyResult> {
    const data = await this.post('/api/v2/financeiro/segunda-via', {
      contrato_id: customerId,
      fatura_id: invoiceId,
    });
    return {
      boletoUrl: data?.boleto ?? data?.link ?? '',
      pixCopiaCola: data?.pix ?? data?.qrcode ?? '',
      barcode: data?.codigo_barras ?? data?.linha ?? '',
      dueDate: data?.vencimento ?? data?.due_date ?? '',
      amountCents: parseAmountToCents(data?.valor ?? '0'),
    };
  }

  async getConnectionStatus(customerId: string): Promise<ConnectionStatus> {
    const data = await this.get(`/api/v2/contratos/${customerId}/status`);
    const online = data?.ativo === true || data?.status === 'ativo';
    return { online, raw: data };
  }

  async unlockCustomer(customerId: string) {
    return this.post(`/api/v2/contratos/${customerId}/desbloquear`, {});
  }
}
