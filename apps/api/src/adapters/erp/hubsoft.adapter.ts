import type { ERPProvider, ERPCredentials, HttpClient, SecondCopyResult, ConnectionStatus } from './erp.types';
import { parseAmountToCents, normalizeErpBaseUrl, readErpErrorBody, ERP_HTTP_TIMEOUT_MS } from './erp.types';
import type { OAuthTokenCache } from './erp-oauth-cache.service';

/**
 * P0-05 — Hubsoft adapter.
 *
 * Hubsoft usa autenticação Bearer via token de acesso. Os endpoints seguem a
 * API REST do Hubsoft (ISP Manager). Integração com módulo financeiro e
 * controle de conexão via ONU/OLT.
 * HTTP injetável para teste.
 *
 * Autenticação (dois modos, mesmo padrão do VoalleAdapter):
 *  1. OAuth2 password grant — credenciais trazem `clientId` + `clientSecret` +
 *     `username` + `password`; o adapter troca em POST /oauth/token e cacheia
 *     o access_token respeitando `expires_in`.
 *  2. Token pré-gerado — credenciais trazem `token` (Bearer) já pronto; usado
 *     direto, sem token-exchange (compat com integrações antigas).
 *
 * Confirmado 2026-08-29 contra a doc oficial (github.com/hubsoftbrasil/api,
 * docs/source/autenticacao.rst e exemplos/php.rst): endpoint `POST
 * /oauth/token`, `grant_type: "password"` (não client_credentials — a API do
 * Hubsoft exige client_id + client_secret + username + password juntos),
 * resposta com `access_token`/`token_type`/`expires_in`/`refresh_token`. A
 * doc não documenta um fluxo de refresh via `refresh_token` — orienta gerar
 * um token novo quando o atual expira (ou quando a API responde 401 mesmo
 * antes de expirar, caso um admin revogue manualmente).
 *
 * `tokenCache` opcional (Redis, escopo tenant+provider — ver
 * `erp-oauth-cache.service.ts`) sobrevive entre instâncias, já que
 * `erp.factory.ts` cria uma instância nova por chamada. Sem ele, cai de volta
 * pro cache em memória local (só vale dentro da mesma instância).
 */
export class HubsoftAdapter implements ERPProvider {
  readonly name = 'hubsoft' as const;

  private readonly baseUrl: string;
  private accessToken?: string;
  private tokenExpiresAt = 0;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
    private readonly tokenCache?: OAuthTokenCache,
  ) {
    const hasToken = !!creds?.token;
    const hasOAuth = !!(creds?.clientId && creds?.clientSecret && creds?.username && creds?.password);
    if (!creds?.url || (!hasToken && !hasOAuth)) {
      throw new Error('Hubsoft: credenciais ausentes (url + token OU clientId/clientSecret/username/password)');
    }
    this.baseUrl = normalizeErpBaseUrl(creds.url);
  }

  /**
   * Retorna um Bearer válido. Com `token` pré-gerado, devolve direto. Com
   * clientId/clientSecret/username/password, faz o grant password (única
   * modalidade documentada pelo Hubsoft), cacheando o access_token — primeiro
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

    const res = await this.http(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'password',
        client_id: this.creds.clientId,
        client_secret: this.creds.clientSecret,
        username: this.creds.username,
        password: this.creds.password,
      }),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`Hubsoft OAuth Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    const data = await res.json();
    const token = data?.access_token;
    if (!token) throw new Error('Hubsoft OAuth: resposta sem access_token');
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

  private async get(path: string) {
    const res = await this.http(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: await this.headers(),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`Hubsoft API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
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
      throw new Error(`Hubsoft API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    return res.json();
  }

  async findCustomerByCpf(cpf: string) {
    const clean = cpf.replace(/\D/g, '');
    return this.get(`/api/v1/clientes?cpf_cnpj=${clean}&per_page=5`);
  }

  async getBillingStatus(customerId: string) {
    return this.get(`/api/v1/financeiro/cobrancas?cliente_id=${customerId}&status=pendente&per_page=10`);
  }

  async generateSecondCopy(customerId: string, invoiceId: string): Promise<SecondCopyResult> {
    const data = await this.post(`/api/v1/financeiro/cobrancas/${invoiceId}/segunda-via`, {
      cliente_id: customerId,
    });
    return {
      boletoUrl: data?.boleto?.url ?? data?.url ?? '',
      pixCopiaCola: data?.pix?.copia_cola ?? data?.pix ?? '',
      barcode: data?.boleto?.linha_digitavel ?? data?.codigo_barras ?? '',
      dueDate: data?.data_vencimento ?? data?.vencimento ?? '',
      amountCents: parseAmountToCents(data?.valor ?? data?.amount ?? '0'),
    };
  }

  async getConnectionStatus(customerId: string): Promise<ConnectionStatus> {
    const data = await this.get(`/api/v1/clientes/${customerId}/conexao`);
    const online = data?.ativo === true || data?.status === 'ativo' || data?.conectado === true;
    return { online, raw: data };
  }

  async unlockCustomer(customerId: string) {
    return this.post(`/api/v1/clientes/${customerId}/desbloquear`, { tipo: 'confianca' });
  }
}
