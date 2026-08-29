import type { ERPProvider, ERPCredentials, HttpClient, SecondCopyResult, ConnectionStatus } from './erp.types';
import { parseAmountToCents, normalizeErpBaseUrl, readErpErrorBody, ERP_HTTP_TIMEOUT_MS } from './erp.types';

/**
 * P0-04 — SGP/TSMX adapter.
 *
 * SGP usa autenticação via API Key no header `token`. Os endpoints seguem
 * o padrão REST do SGP 3.x. Integra OLT e gateways de pagamento (PIX nativo).
 * HTTP injetável para teste.
 *
 * ⚠️ Auditoria 2026-08-28: a API real do SGP pode exigir um `app_token`
 * (identifica a integração cadastrada) além deste `token` de usuário — não
 * confirmado contra doc oficial nem instância real. Validar antes do primeiro
 * teste ao vivo (ver CHECKLIST_PENDENCIAS_EXTERNAS.md).
 */
export class SGPAdapter implements ERPProvider {
  readonly name = 'sgp' as const;

  private readonly baseUrl: string;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token) throw new Error('SGP: credenciais ausentes (url + token)');
    this.baseUrl = normalizeErpBaseUrl(creds.url);
  }

  private headers() {
    return {
      'Content-Type': 'application/json',
      token: this.creds.token,
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
      throw new Error(`SGP API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
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
      throw new Error(`SGP API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
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
