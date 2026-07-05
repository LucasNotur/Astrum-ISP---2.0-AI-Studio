import { parseAmountToCents, type ERPProvider, type ERPCredentials, type HttpClient, type SecondCopyResult, type ConnectionStatus } from './erp.types';

/**
 * IXC Adapter — port de src/lib/integrations/ixcClient.ts para apps/api.
 * HTTP injetável para teste; normaliza a 2ª via (boleto/pix) para o formato comum.
 */
export class IXCAdapter implements ERPProvider {
  readonly name = 'ixc' as const;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token) throw new Error('IXC: credenciais ausentes');
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(this.creds.token).toString('base64')}`,
      ...extra,
    };
  }

  private async post(path: string, body: unknown, listar = true) {
    const res = await this.http(`${this.creds.url}${path}`, {
      method: 'POST',
      headers: this.headers(listar ? { ixcsoft: 'listar' } : {}),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`IXC API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async findCustomerByCpf(cpf: string) {
    return this.post('/webservice/v1/cliente', {
      qtype: 'cliente.cnpj_cpf', query: cpf.replace(/\D/g, ''), oper: '=', page: '1', rp: '20',
      sortname: 'cliente.id', sortorder: 'desc',
    });
  }

  async getBillingStatus(customerId: string) {
    return this.post('/webservice/v1/fn_areceber', {
      qtype: 'fn_areceber.id_cliente', query: customerId, oper: '=', page: '1', rp: '50',
      sortname: 'fn_areceber.data_vencimento', sortorder: 'asc',
    });
  }

  async getConnectionStatus(customerId: string): Promise<ConnectionStatus> {
    const data = await this.post('/webservice/v1/radusuarios', {
      qtype: 'radusuarios.id_cliente', query: customerId, oper: '=', page: '1', rp: '20',
      sortname: 'radusuarios.id', sortorder: 'desc',
    });
    const rows = data?.registros ?? [];
    const online = rows.some((r: any) => r?.online === 'S' || r?.status === 'online');
    return { online, raw: data };
  }

  async generateSecondCopy(_customerId: string, invoiceId: string): Promise<SecondCopyResult> {
    const data = await this.post('/webservice/v1/get_boleto', {
      boletos: invoiceId, juros: 'S', multa: 'S', atualiza_boleto: 'S', tipo_boleto: 'link',
    }, false);
    return normalizeIxcSecondCopy(data);
  }

  async unlockCustomer(customerId: string) {
    return this.post('/webservice/v1/cliente_desbloqueio_confianca', { id_cliente: customerId }, false);
  }
}

/** Normaliza a resposta de 2ª via do IXC para o formato comum (reais → centavos). */
export function normalizeIxcSecondCopy(data: any): SecondCopyResult {
  return {
    boletoUrl: data?.url ?? data?.link ?? data?.boleto_url ?? '',
    pixCopiaCola: data?.pix ?? data?.pix_copia_cola ?? data?.qrcode ?? '',
    barcode: data?.linha_digitavel ?? data?.barcode ?? '',
    dueDate: data?.data_vencimento ?? data?.due_date ?? '',
    amountCents: parseAmountToCents(data?.valor ?? data?.amount ?? '0'),
  };
}
