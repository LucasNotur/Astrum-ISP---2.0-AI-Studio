import { parseAmountToCents, normalizeErpBaseUrl, ERP_HTTP_TIMEOUT_MS, type ERPProvider, type ERPCredentials, type HttpClient, type SecondCopyResult, type ConnectionStatus } from './erp.types';

/**
 * RBX (RBXSoft) adapter — reescrito 2026-08-29 contra a doc oficial
 * (developers.rbxsoft.com/v2/) + a collection Postman oficial baixada da
 * própria página (link "📥 Postman Collection JSON"). A versão anterior
 * (S75) era inteiramente inventada — REST comum (`/api/v1/cliente?cpf=`)
 * não existe; a API real é RPC sobre HTTP: um único endpoint POST por
 * versão, com o nome do serviço como chave raiz do corpo JSON.
 *
 * DUAS versões coexistem com auth e endpoint diferentes:
 * - v2.0 (`/routerbox/ws_json/ws_json.php`): auth no header `authentication_key`.
 *   Usada aqui pra conexão (`get_online_customer`), cobrança (`get_unpaid_document`)
 *   e bloqueio/desbloqueio de contrato (`contract_block`/`contract_unblock`) —
 *   todos confirmados com exemplo de request/response reais na doc.
 * - v1.0 (`/routerbox/ws/rbx_server_json.php`): auth embutida no corpo
 *   (`Autenticacao.ChaveIntegracao`), sem exemplos de resposta na doc nem no
 *   Postman. Usada só onde a v2.0 não tem equivalente: busca de cliente por
 *   CPF (`ConsultaClientes`) e linha digitável do boleto
 *   (`ConsultaLinhaDigitavelBoleto`) — **campo de filtro por CPF não
 *   confirmado** (a doc só mostra exemplos com `Codigo`/`Nome`/`Cliente_Codigo`;
 *   `CPF` é a suposição mais razoável dado o padrão SQL-like do `Filtro`, mas
 *   não há exemplo oficial). Mesmo tipo de incerteza documentada já usada nos
 *   outros adapters quando não há doc oficial completa.
 *
 * `unlockCustomer`/bloqueio exigem contract_id, que a API não aceita junto
 * com customer_id isolado — resolvido internamente via `get_equipment_customer`
 * (sempre retorna contract_id, mesmo sem sessão ativa).
 */
export class RBXAdapter implements ERPProvider {
  readonly name = 'rbx' as const;

  private readonly v1Url: string;
  private readonly v2Url: string;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token) throw new Error('RBX: credenciais ausentes (url + token/chave de integração)');
    const base = normalizeErpBaseUrl(creds.url);
    this.v1Url = `${base}/routerbox/ws/rbx_server_json.php`;
    this.v2Url = `${base}/routerbox/ws_json/ws_json.php`;
  }

  private assertRbxOk(data: any, context: string): void {
    if (!data?.status) {
      throw new Error(`RBX: ${context} — ${data?.error_description || 'erro retornado pelo ERP'}`);
    }
  }

  private async postV2(service: string, payload: unknown) {
    const res = await this.http(this.v2Url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authentication_key: this.creds.token },
      body: JSON.stringify({ [service]: payload }),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`RBX API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  private async postV1(service: string, payload: Record<string, unknown>) {
    const res = await this.http(this.v1Url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [service]: { Autenticacao: { ChaveIntegracao: this.creds.token }, ...payload } }),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`RBX API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /**
   * Campo de filtro por CPF não confirmado oficialmente (ver comentário da
   * classe) — e o formato do envelope de resposta da v1.0 não tem exemplo
   * documentado em lugar nenhum (nem na doc, nem no Postman), então devolve
   * o corpo cru em vez de tentar normalizar um formato que não foi visto.
   */
  async findCustomerByCpf(cpf: string) {
    const clean = cpf.replace(/\D/g, '');
    return this.postV1('ConsultaClientes', { Filtro: `CPF = '${clean}'` });
  }

  async getBillingStatus(customerId: string) {
    const data = await this.postV2('get_unpaid_document', { customer_id: Number(customerId) });
    this.assertRbxOk(data, 'consulta de documentos em aberto falhou');
    return data.result ?? [];
  }

  /** Resposta da v1 não documentada — parsing defensivo com fallback de nomes de campo. */
  async generateSecondCopy(customerId: string, invoiceId: string): Promise<SecondCopyResult> {
    const r = await this.postV1('ConsultaLinhaDigitavelBoleto', {
      DadosLinhaDigitavelEntrada: { Tipo: 'C', CliFor: Number(customerId), Documento: Number(invoiceId) },
    });
    return {
      boletoUrl: r?.LinkBoleto ?? r?.boleto_url ?? r?.link ?? '',
      pixCopiaCola: r?.PixCopiaCola ?? r?.pix ?? '',
      barcode: r?.LinhaDigitavel ?? r?.linha_digitavel ?? r?.barcode ?? '',
      dueDate: r?.DataVencimento ?? r?.vencimento ?? '',
      amountCents: parseAmountToCents(r?.Valor ?? r?.valor ?? '0'),
    };
  }

  async getConnectionStatus(customerId: string): Promise<ConnectionStatus> {
    const data = await this.postV2('get_online_customer', { customer_id: Number(customerId) });
    this.assertRbxOk(data, 'consulta de cliente on-line falhou');
    const rows = Array.isArray(data.result) ? data.result : [];
    return { online: rows.length > 0, raw: data };
  }

  private async resolveContractId(customerId: string): Promise<number> {
    const data = await this.postV2('get_equipment_customer', { customer_id: Number(customerId) });
    this.assertRbxOk(data, 'resolução de contrato falhou');
    const contractId = Number(data?.result?.[0]?.contract_id ?? 0);
    if (!contractId) throw new Error('RBX: não foi possível resolver o contract_id do cliente');
    return contractId;
  }

  async unlockCustomer(customerId: string) {
    const contractId = await this.resolveContractId(customerId);
    const data = await this.postV2('contract_unblock', { customer_id: Number(customerId), contract_id: contractId });
    this.assertRbxOk(data, 'desbloqueio de contrato falhou');
    return data;
  }
}
