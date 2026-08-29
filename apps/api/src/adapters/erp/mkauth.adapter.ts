import { parseAmountToCents, normalizeErpBaseUrl, readErpErrorBody, ERP_HTTP_TIMEOUT_MS, type ERPProvider, type ERPCredentials, type HttpClient, type SecondCopyResult, type ConnectionStatus } from './erp.types';

/**
 * MK-Auth Adapter — port de src/lib/integrations/mkAuthClient.ts para apps/api.
 * HTTP injetável; header MK-Auth-Key.
 */
export class MKAuthAdapter implements ERPProvider {
  readonly name = 'mkauth' as const;

  private readonly baseUrl: string;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token) throw new Error('MK-Auth: credenciais ausentes');
    this.baseUrl = normalizeErpBaseUrl(creds.url);
  }

  private headers() {
    return { 'MK-Auth-Key': this.creds.token, 'Content-Type': 'application/json' };
  }

  private async req(path: string, init: any = {}) {
    const res = await this.http(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
      ...init,
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`MK-Auth API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    // Achado de auditoria 2026-08-28: painéis MK-Auth self-hosted às vezes
    // devolvem HTML/texto de erro de PHP com status 200 (sessão expirada,
    // warning solto) — res.json() cru dava um SyntaxError opaco sem contexto.
    try {
      return await res.json();
    } catch (err) {
      throw new Error(`MK-Auth: resposta não é JSON válido (${path}) — provável sessão expirada ou erro de painel`);
    }
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
    const target = list.find((b: any) => String(b?.id ?? b?.uuid) === String(invoiceId));
    // Achado de auditoria 2026-08-28: caía pro primeiro boleto da lista quando
    // o invoiceId pedido não era encontrado — risco real de mandar a cobrança
    // de uma fatura diferente da que o cliente pediu.
    if (!target) {
      throw new Error(`MK-Auth: fatura ${invoiceId} não encontrada para o cliente ${customerId}`);
    }
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
