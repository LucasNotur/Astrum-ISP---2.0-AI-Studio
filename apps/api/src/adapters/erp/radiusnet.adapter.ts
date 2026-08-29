import { parseAmountToCents, normalizeErpBaseUrl, ERP_HTTP_TIMEOUT_MS, type ERPProvider, type ERPCredentials, type HttpClient, type SecondCopyResult, type ConnectionStatus } from './erp.types';

/**
 * RadiusNet adapter — reescrito 2026-08-29 contra a doc oficial publicada
 * (radius.net.br/api/, prosa completa com exemplos de request/response reais
 * por endpoint). A versão anterior (S75) era inteiramente inventada: path
 * base errado (`/api/clientes` não existe), auth errada (Bearer — a real é
 * o header `RTOKEN` cru, sem esquema), e endpoints sem nenhuma correspondência
 * com a API real.
 *
 * Path base real: `{host}/radiusnet/index.php/api/v1/...` (fixo, não é
 * configurável pelo tenant — só o host entra em `creds.url`).
 *
 * Limitação real documentada (não contornável): a API v1 não tem endpoint de
 * status de conexão por cliente específico — só `/cl` (lista paginada de
 * TODOS os clientes, sem filtro por CPF/id). `getConnectionStatus` usa o
 * status administrativo do plano (Ativo/Avisado/Bloqueado via `/cp`) como
 * proxy, não sessão RADIUS ao vivo — mesma limitação já documentada nos
 * outros adapters (Voalle/MK-Auth).
 *
 * IDs: `/cp` e `/cl` usam CPF/CNPJ; `/cbc`, `/bc`, `/scp`, `/ppg`, `/ascli`
 * usam o id_cliente ou id_cobranca interno do RadiusNet (não CPF).
 */
export class RadiusNetAdapter implements ERPProvider {
  readonly name = 'radiusnet' as const;

  private readonly baseUrl: string;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token) throw new Error('RadiusNet: credenciais ausentes (url + token/RTOKEN)');
    this.baseUrl = `${normalizeErpBaseUrl(creds.url)}/radiusnet/index.php/api/v1`;
  }

  private headers(extra: Record<string, string> = {}) {
    return { RTOKEN: this.creds.token, ...extra };
  }

  private async get(path: string) {
    const res = await this.http(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`RadiusNet API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  private async put(path: string, formBody?: Record<string, string>) {
    const res = await this.http(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.headers(formBody ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      body: formBody ? new URLSearchParams(formBody).toString() : undefined,
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`RadiusNet API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /** `cpf` = CPF/CNPJ sem máscara. Retorna todos os planos do cliente (todos os status). */
  async findCustomerByCpf(cpf: string) {
    const clean = cpf.replace(/\D/g, '');
    const data = await this.get(`/cp/${clean}/5`);
    return data?.rows ?? data;
  }

  /** `customerId` = id_cliente interno do RadiusNet. Cobranças não pagas (registradas e não registradas). */
  async getBillingStatus(customerId: string) {
    const data = await this.get(`/cbc/npt/${encodeURIComponent(customerId)}`);
    return data?.rows ?? [];
  }

  /**
   * `customerId` = id_cliente; `invoiceId` = id_cobranca. Combina 3 chamadas:
   * a listagem de cobranças (pra achar valor/vencimento/linha digitável da
   * cobrança pedida), o boleto PDF (`/bc`) e o Pix (`/scp`) — nenhum endpoint
   * único devolve os 5 campos de uma vez.
   */
  async generateSecondCopy(customerId: string, invoiceId: string): Promise<SecondCopyResult> {
    const [billing, boleto, pix] = await Promise.all([
      this.getBillingStatus(customerId).catch(() => [] as any[]),
      this.get(`/bc/${encodeURIComponent(invoiceId)}`).catch(() => null),
      this.get(`/scp/${encodeURIComponent(invoiceId)}`).catch(() => null),
    ]);
    const cobranca = (billing as any[]).find((r) => String(r?.id_cobranca) === String(invoiceId));
    return {
      boletoUrl: typeof boleto?.rows === 'string' ? boleto.rows : '',
      pixCopiaCola: pix?.rows?.qrcode_copy_paste ?? '',
      barcode: cobranca?.linha_digitavel ?? '',
      dueDate: cobranca?.data_vencimento ?? '',
      amountCents: parseAmountToCents(cobranca?.valor_total_a_pagar ?? '0'),
    };
  }

  /**
   * Sem endpoint de sessão RADIUS por cliente na API v1 (só `/cl`, lista
   * paginada de todos sem filtro por CPF). Proxy: `cpf` tem algum plano com
   * status "Ativo" (id_status_plano=2)? Não é conexão ao vivo.
   */
  async getConnectionStatus(cpf: string): Promise<ConnectionStatus> {
    const clean = cpf.replace(/\D/g, '');
    const data = await this.get(`/cp/${clean}/2`);
    const rows = data?.rows;
    const online = Array.isArray(rows) ? rows.length > 0 : !!rows;
    return { online, raw: data };
  }

  /**
   * `customerId` = id_cliente. Muda o status pra "Avisado" (2) — libera
   * velocidade integral mesmo com pendência, pelo prazo configurado no
   * RadiusNet (Administração >> Configurações >> Financeiro).
   */
  async unlockCustomer(customerId: string) {
    return this.put('/ascli/', { IDCLI: customerId, IDSTATUS: '2' });
  }
}
