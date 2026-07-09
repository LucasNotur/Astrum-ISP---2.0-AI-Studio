import type { ERPProvider, ERPCredentials, HttpClient, SecondCopyResult, ConnectionStatus } from './erp.types';
import { parseAmountToCents } from './erp.types';

/**
 * P0-02 — Voalle/Elleven adapter.
 *
 * A API do Elleven é nova (lançada MWC 2026). Os endpoints abaixo seguem a
 * documentação pública disponível até 2026-07 e o padrão REST do Elleven.
 * Quando a Voalle publicar SDKs/webhooks oficiais, substituir os POLLINGs
 * por event-driven. HTTP injetável para teste.
 *
 * Autenticação: Bearer token gerado via POST /oauth/token (client_credentials).
 * O token é armazenado no campo `token` das credenciais (ISP já gera externamente
 * no wizard ou o adapter pode fazer a troca — por ora, token pré-gerado).
 */
export class VoalleAdapter implements ERPProvider {
  readonly name = 'voalle' as const;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token) throw new Error('Voalle: credenciais ausentes (url + token)');
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
    if (!res.ok) throw new Error(`Voalle API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  private async post(path: string, body: unknown) {
    const res = await this.http(`${this.creds.url}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Voalle API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async findCustomerByCpf(cpf: string) {
    const clean = cpf.replace(/\D/g, '');
    return this.get(`/v1/clientes?cpf=${clean}&limit=5`);
  }

  async getBillingStatus(customerId: string) {
    return this.get(`/v1/financeiro/titulos?cliente_id=${customerId}&status=aberto&limit=10`);
  }

  async generateSecondCopy(customerId: string, invoiceId: string): Promise<SecondCopyResult> {
    const data = await this.post('/v1/financeiro/segunda-via', {
      cliente_id: customerId,
      titulo_id: invoiceId,
      tipo: 'boleto_pix',
    });
    return {
      boletoUrl: data?.boleto_url ?? data?.url ?? '',
      pixCopiaCola: data?.pix_copia_cola ?? data?.pix ?? '',
      barcode: data?.linha_digitavel ?? data?.codigo_barras ?? '',
      dueDate: data?.data_vencimento ?? '',
      amountCents: parseAmountToCents(data?.valor ?? data?.amount ?? '0'),
    };
  }

  async getConnectionStatus(customerId: string): Promise<ConnectionStatus> {
    const data = await this.get(`/v1/clientes/${customerId}/conexao`);
    const online = data?.status === 'ativo' || data?.online === true;
    return { online, raw: data };
  }

  async unlockCustomer(customerId: string) {
    return this.post(`/v1/clientes/${customerId}/desbloqueio`, { tipo: 'confianca' });
  }
}
