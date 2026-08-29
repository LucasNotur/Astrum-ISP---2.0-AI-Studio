import type { ERPProvider, ERPCredentials, HttpClient, SecondCopyResult, ConnectionStatus } from './erp.types';
import { parseAmountToCents, normalizeErpBaseUrl, readErpErrorBody, ERP_HTTP_TIMEOUT_MS } from './erp.types';
import type { OAuthTokenCache } from './erp-oauth-cache.service';

/**
 * P0-02 — Voalle/Elleven adapter.
 *
 * Reescrito por completo 2026-08-29 — a versão anterior (OAuth client_credentials
 * em JSON contra `/oauth/token` no mesmo host) era inventada, sem nenhuma fonte.
 * Não existe doc oficial pública nem Postman publicado da Voalle/Elleven (o link
 * indexado pelo Google, postman.com/desenvelite/voalle-integrator, não existe
 * mais — redireciona pra home do Postman). A única fonte encontrada foi o SDK
 * Go de terceiros **`github.com/raykavin/elleven-go`** ("Unofficial Elleven
 * Third-Party API", MIT, testes para cada módulo, README detalhado) — não é
 * doc oficial da Voalle, mas os detalhes são específicos demais pra serem
 * chute (secret de plataforma real, portas exatas, caminho exato na UI do
 * campo `syndata`), o que dá confiança razoável. **Sem validação ao vivo** —
 * não achei instância de teste.
 *
 * Diferença arquitetural grande: a API do Elleven roda **duas portas
 * separadas no mesmo host** — auth numa porta, o resto da API noutra
 * (`:45700` e `:45715` por padrão, confirmado no README do SDK, overridável
 * caso o tenant exponha portas diferentes por trás de proxy).
 *
 * Autenticação (dois modos, mesmo padrão dos outros adapters OAuth):
 *  1. `clientId` + `clientSecret` + `syndata` — troca via
 *     `POST {authUrl}/connect/token`, **form-urlencoded** (não JSON — é o
 *     endpoint OAuth2 padrão RFC 6749, diferente do resto da API que é JSON),
 *     `grant_type=client_credentials&scope=syngw`. `clientId`/`clientSecret`
 *     vêm de Settings → Users → Integration User; `syndata` vem de
 *     Suite → Settings → Parameters → Integration/Map — é um 3º segredo que
 *     a versão anterior deste adapter não pedia nem sabia que existia.
 *  2. `token` pré-gerado — usado direto como Bearer, sem exchange.
 *
 * Endpoints de negócio (todos JSON, contra `{apiUrl}`, envelope
 * `{ success, messages, response: T }` — os dados vêm em `.response`, não em
 * `.data`):
 *  - Cliente: `GET /external/integrations/thirdparty/people/txid/{cpf}`.
 *  - Faturas em aberto: `GET /external/integrations/thirdparty/getopentitlesbytxid/{cpf}`.
 *  - 2ª via: `GET .../gettitlesbytxid/{cpf}` (busca mais ampla, inclui pagas)
 *    — o boleto/PIX já vêm prontos dentro de cada título (`billet.pixQRCode`,
 *    `billet.typefulLine`); **não achei campo de link de boleto PDF** — existe
 *    um endpoint de download binário (`GetInvoicePDF`) que devolve bytes, não
 *    uma URL, e não dá pra expressar no `SecondCopyResult.boletoUrl: string`
 *    sem inventar um passo novo — fica vazio por honestidade.
 *  - Conexão: `GET .../getaccesspointstatusbyclient/{id_numerico}` — **isso é
 *    o status do ACCESS POINT/OLT (equipamento), não uma sessão RADIUS por
 *    cliente** (o SDK não expõe nada assim); usa `people/txid` primeiro pra
 *    resolver o `id` numérico a partir do CPF. Mesma limitação de proxy já
 *    documentada nos outros adapters (bloqueio administrativo/equipamento,
 *    não sessão de rede ao vivo) — aqui pior ainda, é o equipamento, não nem
 *    o cliente.
 *  - Desbloqueio: `POST .../contracts/unlock/{contractNumber}` — **usa o
 *    NÚMERO DO CONTRATO, não o CPF nem um id numérico**, e o SDK não expõe
 *    nenhum jeito de resolver CPF→contrato. `unlockCustomer` aqui exige que
 *    quem chama já tenha o número do contrato em mãos (inconsistência real
 *    da API, não do adapter) — documentado explicitamente pra não virar bug
 *    silencioso quando alguém passar CPF por engano.
 */
export class VoalleAdapter implements ERPProvider {
  readonly name = 'voalle' as const;

  private readonly authBaseUrl: string;
  private readonly apiBaseUrl: string;
  private accessToken?: string;
  private tokenExpiresAt = 0;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
    private readonly tokenCache?: OAuthTokenCache,
  ) {
    const hasToken = !!creds?.token;
    const hasOAuth = !!(creds?.clientId && creds?.clientSecret && creds?.syndata);
    if (!creds?.url || (!hasToken && !hasOAuth)) {
      throw new Error('Voalle: credenciais ausentes (url + token OU clientId/clientSecret/syndata)');
    }
    const base = normalizeErpBaseUrl(creds.url);
    const authPort = String(creds.authPort ?? '45700');
    const apiPort = String(creds.apiPort ?? '45715');
    this.authBaseUrl = `${base}:${authPort}`;
    this.apiBaseUrl = `${base}:${apiPort}`;
  }

  /**
   * Retorna um Bearer válido. Com `token` pré-gerado, devolve direto. Com
   * clientId/clientSecret/syndata, faz o grant client_credentials
   * (form-urlencoded, na porta de auth), cacheando o access_token — primeiro
   * no `tokenCache` compartilhado (se injetado), depois em memória local — e
   * renovando 60s antes do `expires_in` informado pelo ERP.
   */
  private async getAccessToken(): Promise<string> {
    if (this.creds.token && !this.creds.clientId) return String(this.creds.token);

    if (this.accessToken && Date.now() < this.tokenExpiresAt) return this.accessToken;

    if (this.tokenCache) {
      const cached = await this.tokenCache.get();
      if (cached) {
        this.accessToken = cached;
        return cached;
      }
    }

    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'syngw',
      client_id: String(this.creds.clientId),
      client_secret: String(this.creds.clientSecret),
      syndata: String(this.creds.syndata),
    });
    const res = await this.http(`${this.authBaseUrl}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`Voalle OAuth Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    const data = await res.json();
    const token = data?.access_token;
    if (!token) throw new Error('Voalle OAuth: resposta sem access_token');
    this.accessToken = String(token);
    const ttlSec = Number(data?.expires_in ?? 3600);
    this.tokenExpiresAt = Date.now() + Math.max(0, ttlSec - 60) * 1000;
    if (this.tokenCache) await this.tokenCache.set(this.accessToken, Math.max(0, ttlSec - 60));
    return this.accessToken;
  }

  private async headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await this.getAccessToken()}`,
    };
  }

  /** Chama a API e devolve `.response` (envelope padrão `{success, messages, response}`). */
  private async get(path: string) {
    const res = await this.http(`${this.apiBaseUrl}${path}`, {
      method: 'GET',
      headers: await this.headers(),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`Voalle API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    const data = await res.json();
    return data?.response;
  }

  private async post(path: string, body: unknown) {
    const res = await this.http(`${this.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`Voalle API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    const data = await res.json();
    return data?.response;
  }

  async findCustomerByCpf(cpf: string) {
    const clean = cpf.replace(/\D/g, '');
    return this.get(`/external/integrations/thirdparty/people/txid/${clean}`);
  }

  async getBillingStatus(cpf: string) {
    const clean = cpf.replace(/\D/g, '');
    return this.get(`/external/integrations/thirdparty/getopentitlesbytxid/${clean}`);
  }

  async generateSecondCopy(cpf: string, invoiceId: string): Promise<SecondCopyResult> {
    const clean = cpf.replace(/\D/g, '');
    // gettitlesbytxid (não getopentitlesbytxid) — busca mais ampla, inclui
    // faturas já pagas, pra achar a fatura pedida mesmo fora do "em aberto".
    const invoices: any[] = (await this.get(`/external/integrations/thirdparty/gettitlesbytxid/${clean}`)) ?? [];
    const invoice = invoices.find((i) => String(i?.id) === String(invoiceId));
    if (!invoice) throw new Error(`Voalle: fatura ${invoiceId} não encontrada para o CPF/CNPJ ${clean}`);
    const billet = invoice?.billet ?? {};
    return {
      boletoUrl: '',
      pixCopiaCola: billet?.pixQRCode ?? '',
      barcode: billet?.typefulLine ?? billet?.barcode ?? '',
      dueDate: billet?.expirationDate ?? '',
      amountCents: parseAmountToCents(billet?.amount?.finalValue ?? billet?.amount?.value ?? 0),
    };
  }

  async getConnectionStatus(cpf: string): Promise<ConnectionStatus> {
    const clean = cpf.replace(/\D/g, '');
    const person = await this.get(`/external/integrations/thirdparty/people/txid/${clean}`);
    const clientId = person?.id;
    if (!clientId) throw new Error(`Voalle: cliente ${clean} não encontrado`);
    const accessPoints: any[] = (await this.get(`/external/integrations/thirdparty/getaccesspointstatusbyclient/${clientId}`)) ?? [];
    const online = accessPoints.length > 0 && accessPoints.every((ap) => ap?.active === true);
    return { online, raw: accessPoints };
  }

  /**
   * ⚠️ `contractNumber` aqui é o NÚMERO DO CONTRATO Voalle, não o CPF —
   * a API real (`POST .../contracts/unlock/{contractNumber}`) não aceita CPF
   * e o SDK não expõe resolução CPF→contrato. Quem chama precisa já ter o
   * número do contrato (ex.: de um cadastro prévio), não o CPF usado nos
   * outros métodos deste adapter.
   */
  async unlockCustomer(contractNumber: string) {
    return this.post(`/external/integrations/thirdparty/contracts/unlock/${encodeURIComponent(contractNumber)}`, {});
  }
}
