import type { ERPProvider, ERPCredentials, HttpClient, SecondCopyResult, ConnectionStatus } from './erp.types';
import { parseAmountToCents } from './erp.types';

/**
 * S75 — RBX adapter. Port de src/lib/integrations/rbxClient.ts.
 * Auth via Basic (token = user:pass em base64). HTTP injetável para teste.
 */
export class RBXAdapter implements ERPProvider {
  readonly name = 'rbx' as const;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token) throw new Error('RBX: credenciais ausentes (url + token)');
  }

  private headers() {
    const b64 = typeof Buffer !== 'undefined'
      ? Buffer.from(this.creds.token).toString('base64')
      : btoa(this.creds.token);
    return {
      'Content-Type': 'application/json',
      Authorization: `Basic ${b64}`,
    };
  }

  private async get(path: string) {
    const res = await this.http(`${this.creds.url}${path}`, { method: 'GET', headers: this.headers() });
    if (!res.ok) throw new Error(`RBX API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  private async post(path: string, body: unknown) {
    const res = await this.http(`${this.creds.url}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`RBX API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async findCustomerByCpf(cpf: string) {
    const clean = cpf.replace(/\D/g, '');
    return this.get(`/api/v1/cliente?cpf=${clean}`);
  }

  async getBillingStatus(clienteId: string) {
    return this.get(`/api/v1/financeiro/titulos?cliente_id=${encodeURIComponent(clienteId)}`);
  }

  async generateSecondCopy(customerId: string, invoiceId: string): Promise<SecondCopyResult> {
    const data = await this.post('/api/v1/financeiro/segunda-via', {
      cliente_id: customerId,
      titulo_id: invoiceId,
    });
    return {
      boletoUrl: data?.boleto_url ?? data?.link ?? '',
      pixCopiaCola: data?.pix ?? data?.pix_copia_cola ?? '',
      barcode: data?.linha_digitavel ?? data?.barcode ?? '',
      dueDate: data?.vencimento ?? data?.due_date ?? '',
      amountCents: parseAmountToCents(data?.valor ?? '0'),
    };
  }

  async getConnectionStatus(clienteId: string): Promise<ConnectionStatus> {
    const data = await this.get(`/api/v1/cliente/${encodeURIComponent(clienteId)}/status`);
    const online = data?.ativo === true || data?.status === 'ativo' || data?.status === 'online';
    return { online, raw: data };
  }

  async unlockCustomer(clienteId: string) {
    return this.post('/api/v1/cliente/desbloquear', { cliente_id: clienteId });
  }
}
