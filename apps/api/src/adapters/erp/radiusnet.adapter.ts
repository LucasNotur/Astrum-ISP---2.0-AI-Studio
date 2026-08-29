import { parseAmountToCents, normalizeErpBaseUrl, ERP_HTTP_TIMEOUT_MS, type ERPProvider, type ERPSalesCapable, type ERPCredentials, type HttpClient, type SecondCopyResult, type ConnectionStatus, type ViabilityResult, type ErpPlan, type LeadRegistration } from './erp.types';

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
 *
 * **P3 (funil de vendas) 2026-08-29** — sondada a doc oficial completa (baixada
 * via curl, 47 endpoints no total, bem mais que os 6 já usados acima):
 *  - `checkViability`: usa `GET /cto` (retorna TODAS as CTOs cadastradas, com
 *    `endereco`/`portas_disponiveis` — sem filtro de endereço no servidor).
 *    Casa o endereço pedido contra o `endereco` de cada CTO por substring
 *    (case-insensitive, nos dois sentidos) — impreciso se o cadastro de
 *    endereço da CTO não bater com o texto exato que o cliente informar, mas
 *    é a única forma documentada de fazer viabilidade por endereço aqui.
 *  - `createPreRegistration`: usa `POST /createlead` — que exige um header
 *    **`CRMTOKEN` separado do `RTOKEN`** (chave de "acesso à API LEAD",
 *    distinta da API principal — configurável via `creds.crmToken`). Body
 *    aceita só `nome`+`telefone` (obrigatórios) e `email`/`cpf_cnpj`/
 *    `observacao` (opcionais) — sem campo de endereço nem de plano, então
 *    `address` do lead vai dentro de `observacao` (única forma de não perder
 *    o dado) e `planId` é ignorado (a API não tem onde colocá-lo).
 *  - `getPlans`/`scheduleInstallation`: **não suportados** — a doc completa
 *    não tem nenhum endpoint de catálogo de planos (só `/cp`, planos JÁ
 *    vinculados a um cliente existente) nem forma de abrir/agendar uma OS a
 *    partir de um lead — `/at` (criar atendimento) exige `IDCP`
 *    (id_cliente_plano), que só existe depois que o RadiusNet converte o
 *    lead num cliente de verdade pelos processos manuais internos dele.
 */
export class RadiusNetAdapter implements ERPProvider, ERPSalesCapable {
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

  /**
   * `/cto` não filtra por endereço no servidor — busca todas as CTOs e casa
   * por substring (nos dois sentidos) contra o campo `endereco` de cada uma.
   */
  async checkViability(address: string): Promise<ViabilityResult> {
    const data = await this.get('/cto');
    const rows: any[] = data?.rows ?? [];
    const needle = address.trim().toLowerCase();
    const match = needle
      ? rows.find((r) => {
          const endereco = String(r?.endereco ?? '').trim().toLowerCase();
          return endereco && (endereco.includes(needle) || needle.includes(endereco));
        })
      : undefined;
    if (!match) return { available: false, raw: data };
    const availablePorts = Number(match?.portas_disponiveis ?? 0);
    return {
      available: availablePorts > 0,
      ctoId: String(match?.id_cto ?? ''),
      ctoName: String(match?.nome_cto ?? ''),
      availablePorts,
      raw: data,
    };
  }

  async getPlans(): Promise<ErpPlan[]> {
    throw new Error('RadiusNet: getPlans não suportado — a API pública não expõe um catálogo de planos (só planos já vinculados a um cliente existente, via /cp)');
  }

  /**
   * `POST /createlead` — header `CRMTOKEN` (separado do `RTOKEN`), body só
   * aceita nome/telefone/email/cpf_cnpj/observacao. Sem campo de endereço ou
   * plano: `address` vai em `observacao`, `planId` é descartado.
   */
  async createPreRegistration(data: LeadRegistration): Promise<{ leadId: string; externalId?: string }> {
    if (!this.creds.crmToken) throw new Error('RadiusNet: CRMTOKEN não configurado (obrigatório pra criar lead via /createlead)');
    const res = await this.http(`${this.baseUrl}/createlead`, {
      method: 'POST',
      headers: { CRMTOKEN: String(this.creds.crmToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: data.fullName,
        telefone: data.phone,
        email: data.email ?? '',
        cpf_cnpj: data.cpf.replace(/\D/g, ''),
        observacao: data.address ? `Endereço: ${data.address}` : '',
      }),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`RadiusNet API Error: ${res.status} ${res.statusText}`);
    const json = await res.json();
    if (json?.success === false) throw new Error(`RadiusNet: criação de lead falhou — ${json?.message ?? 'erro desconhecido'}`);
    const id = String(json?.id_lead ?? '');
    if (!id) throw new Error('RadiusNet: criação de lead não retornou id_lead');
    return { leadId: id, externalId: id };
  }

  async scheduleInstallation(_leadId: string, _scheduledDate: string): Promise<{ orderId: string }> {
    throw new Error('RadiusNet: scheduleInstallation não suportado — sem endpoint pra converter um lead em cliente/plano nem pra abrir OS sem um id_cliente_plano já existente');
  }
}
