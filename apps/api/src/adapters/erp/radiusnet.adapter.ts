import type { ERPProvider, ERPCredentials, HttpClient, SecondCopyResult, ConnectionStatus } from './erp.types';
import { parseAmountToCents } from './erp.types';

/**
 * S75 — RadiusNet adapter. Port de src/lib/integrations/radiusNetClient.ts.
 * Auth via Bearer token. HTTP injetável para teste.
 */
export class RadiusNetAdapter implements ERPProvider {
  readonly name = 'radiusnet' as const;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token) throw new Error('RadiusNet: credenciais ausentes (url + token)');
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.creds.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async get(path: string) {
    const base = this.creds.url.replace(/\/$/, '');
    const res = await this.http(`${base}${path}`, { method: 'GET', headers: this.headers() });
    if (!res.ok) throw new Error(`RadiusNet API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  private async post(path: string, body: unknown) {
    const base = this.creds.url.replace(/\/$/, '');
    const res = await this.http(`${base}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`RadiusNet API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  private async del(path: string) {
    const base = this.creds.url.replace(/\/$/, '');
    const res = await this.http(`${base}${path}`, { method: 'DELETE', headers: this.headers() });
    if (!res.ok) throw new Error(`RadiusNet API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async findCustomerByCpf(cpf: string) {
    const clean = cpf.replace(/\D/g, '');
    return this.get(`/api/clientes?cpf=${clean}`);
  }

  async getBillingStatus(clienteId: string) {
    return this.get(`/api/financeiro/faturas?cliente_id=${encodeURIComponent(clienteId)}&status=pendente`);
  }

  async generateSecondCopy(customerId: string, invoiceId: string): Promise<SecondCopyResult> {
    const data = await this.post('/api/financeiro/segunda-via', {
      cliente_id: customerId,
      fatura_id: invoiceId,
    });
    return {
      boletoUrl: data?.boleto_url ?? data?.link ?? '',
      pixCopiaCola: data?.pix ?? data?.pix_copia_cola ?? '',
      barcode: data?.linha_digitavel ?? data?.barcode ?? '',
      dueDate: data?.vencimento ?? data?.due_date ?? '',
      amountCents: parseAmountToCents(data?.valor ?? '0'),
    };
  }

  async getConnectionStatus(login: string): Promise<ConnectionStatus> {
    const data = await this.get(`/api/conexoes/status?login=${encodeURIComponent(login)}`);
    const online = data?.online === true || data?.status === 'online' || data?.status === 'ativo';
    return { online, raw: data };
  }

  async unlockCustomer(login: string) {
    return this.del(`/api/bloqueios/${encodeURIComponent(login)}`);
  }
}
