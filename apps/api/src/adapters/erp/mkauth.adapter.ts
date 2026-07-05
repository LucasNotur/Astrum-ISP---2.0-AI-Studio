import { parseAmountToCents, type ERPProvider, type ERPCredentials, type HttpClient, type SecondCopyResult, type ConnectionStatus } from './erp.types';

/**
 * MK-Auth Adapter — port de src/lib/integrations/mkAuthClient.ts para apps/api.
 * HTTP injetável; header MK-Auth-Key.
 */
export class MKAuthAdapter implements ERPProvider {
  readonly name = 'mkauth' as const;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token) throw new Error('MK-Auth: credenciais ausentes');
  }

  private headers() {
    return { 'MK-Auth-Key': this.creds.token, 'Content-Type': 'application/json' };
  }

  private async req(path: string, init: any = {}) {
    const res = await this.http(`${this.creds.url}${path}`, { method: 'GET', headers: this.headers(), ...init });
    if (!res.ok) throw new Error(`MK-Auth API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async findCustomerByCpf(cpf: string) {
    return this.req(`/api/cliente?cliente_cpf=${encodeURIComponent(cpf.replace(/\D/g, ''))}`);
  }

  async getBillingStatus(clienteId: string) {
    return this.req(`/api/boleto?id_cliente=${encodeURIComponent(clienteId)}`);
  }

  async generateSecondCopy(customerId: string, invoiceId: string): Promise<SecondCopyResult> {
    const boletos = await this.getBillingStatus(customerId);
    const list = Array.isArray(boletos) ? boletos : boletos?.registros ?? [];
    const target = list.find((b: any) => String(b?.id ?? b?.uuid) === String(invoiceId)) ?? list[0] ?? {};
    return {
      boletoUrl: target?.url ?? target?.link ?? '',
      pixCopiaCola: target?.pix ?? target?.pixcopiaecola ?? '',
      barcode: target?.linhadigitavel ?? target?.barcode ?? '',
      dueDate: target?.datavenc ?? target?.due_date ?? '',
      amountCents: parseAmountToCents(target?.valor ?? '0'),
    };
  }

  async getConnectionStatus(clienteId: string): Promise<ConnectionStatus> {
    const data = await this.req(`/api/cliente?id=${encodeURIComponent(clienteId)}`);
    const rec = Array.isArray(data) ? data[0] : data;
    return { online: rec?.login === 'ativo' || rec?.status === 'ativo', raw: data };
  }

  async unlockCustomer(clienteId: string) {
    return this.req('/api/cliente/bloquear', { method: 'DELETE', body: JSON.stringify({ id: clienteId }) });
  }
}
