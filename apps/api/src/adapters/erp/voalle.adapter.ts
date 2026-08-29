import type { ERPProvider, ERPCredentials, HttpClient, SecondCopyResult, ConnectionStatus } from './erp.types';
import { parseAmountToCents, normalizeErpBaseUrl, readErpErrorBody, ERP_HTTP_TIMEOUT_MS } from './erp.types';

/**
 * P0-02 — Voalle/Elleven adapter.
 *
 * A API do Elleven é nova (lançada MWC 2026). Os endpoints abaixo seguem a
 * documentação pública disponível até 2026-07 e o padrão REST do Elleven.
 * Quando a Voalle publicar SDKs/webhooks oficiais, substituir os POLLINGs
 * por event-driven. HTTP injetável para teste.
 *
 * Autenticação (dois modos, ambos aceitos pelo wizard):
 *  1. OAuth client_credentials — credenciais trazem `clientId` + `clientSecret`;
 *     o adapter faz a troca em POST /oauth/token e cacheia o access_token
 *     respeitando `expires_in`. É o fluxo que o form da SettingsPage envia.
 *  2. Token pré-gerado — credenciais trazem `token` (Bearer) já pronto; usado
 *     direto, sem token-exchange (compat com integrações antigas).
 *
 * ⚠️ Auditoria 2026-08-28: o cache de `accessToken`/`tokenExpiresAt` abaixo só
 * vale DENTRO da mesma instância. Como `erp.factory.ts` cria uma instância nova
 * por chamada (sem cache persistente por tenant), o modo OAuth reautentica do
 * zero em quase toda operação na prática — não corrigido nesta rodada porque
 * exige decisão de arquitetura (cache compartilhado, provavelmente Redis, por
 * tenant) e não é um bug de lógica isolado. Ver CHECKLIST_PENDENCIAS_EXTERNAS.md.
 */
export class VoalleAdapter implements ERPProvider {
  readonly name = 'voalle' as const;

  private readonly baseUrl: string;
  private accessToken?: string;
  private tokenExpiresAt = 0;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    const hasToken = !!creds?.token;
    const hasOAuth = !!(creds?.clientId && creds?.clientSecret);
    if (!creds?.url || (!hasToken && !hasOAuth)) {
      throw new Error('Voalle: credenciais ausentes (url + token OU clientId/clientSecret)');
    }
    this.baseUrl = normalizeErpBaseUrl(creds.url);
  }

  /**
   * Retorna um Bearer válido. Com `token` pré-gerado, devolve direto. Com
   * clientId/clientSecret, faz o grant client_credentials e cacheia o
   * access_token, renovando 60s antes do `expires_in` informado pelo ERP.
   */
  private async getAccessToken(): Promise<string> {
    // Modo token pré-gerado: estático, nunca expira aqui.
    if (this.creds.token && !this.creds.clientId) return String(this.creds.token);

    // Cache OAuth ainda válido.
    if (this.accessToken && Date.now() < this.tokenExpiresAt) return this.accessToken;

    const res = await this.http(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.creds.clientId,
        client_secret: this.creds.clientSecret,
      }),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`Voalle OAuth Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    const data = await res.json();
    const token = data?.access_token ?? data?.token;
    if (!token) throw new Error('Voalle OAuth: resposta sem access_token');
    this.accessToken = String(token);
    const ttlSec = Number(data?.expires_in ?? 3600);
    this.tokenExpiresAt = Date.now() + Math.max(0, ttlSec - 60) * 1000;
    return this.accessToken;
  }

  private async headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await this.getAccessToken()}`,
    };
  }

  private async get(path: string) {
    const res = await this.http(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: await this.headers(),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`Voalle API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    return res.json();
  }

  private async post(path: string, body: unknown) {
    const res = await this.http(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`Voalle API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
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
