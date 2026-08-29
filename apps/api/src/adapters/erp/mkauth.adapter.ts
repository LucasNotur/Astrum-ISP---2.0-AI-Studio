import { parseAmountToCents, normalizeErpBaseUrl, readErpErrorBody, ERP_HTTP_TIMEOUT_MS, type ERPProvider, type ERPCredentials, type HttpClient, type SecondCopyResult, type ConnectionStatus } from './erp.types';
import type { OAuthTokenCache } from './erp-oauth-cache.service';

/**
 * MK-Auth Adapter.
 *
 * Reescrito por completo 2026-08-29 — a versão anterior deste adapter usava
 * uma API que não existe: header `MK-Auth-Key` + endpoints `/api/cliente`,
 * `/api/boleto`. Confirmado contra a doc oficial ao vivo (Swagger completo
 * baixado de postman.mk-auth.com.br/openapi.yaml — 11784 linhas, lido por
 * inteiro, não resumo — mais wiki.mk-auth.com.br/doku.php?id=api_basic pro
 * formato exato da resposta de autenticação):
 *
 *  - Auth: `GET /api/` com HTTP Basic Auth padrão (`Client_id:Client_Secret`,
 *    gerados em Cadastros → Controle de usuários → [usuário] → aba API). A
 *    resposta é uma STRING JWT crua no corpo — não um JSON com campo
 *    "token" — então decodificamos o próprio claim `exp` do JWT pra saber
 *    quando expira (o exemplo da doc tem ~10min de validade).
 *  - Clientes: `GET /api/cliente/listar/<campo>=<valor>` (filtro livre por
 *    qualquer campo do registro; usamos `cpf_cnpj`) e
 *    `GET /api/cliente/show/{login}`.
 *  - Títulos: `GET /api/titulo/aberto/{cpf_ou_login}` e
 *    `GET /api/titulo/show/{uuid}`. A API não devolve link de boleto PDF
 *    (campo `url` do título é sempre `null` no exemplo oficial) — só linha
 *    digitável (`linhadig`) e PIX (`pix`/`pix_link`/`pix_qr`).
 *  - Bloqueio/desbloqueio: não existe endpoint dedicado. O campo `bloqueado`
 *    ("sim"/"nao") faz parte do registro do cliente (`sis_cliente`) e é
 *    editável via `PUT /api/cliente/editar` com `{ uuid, bloqueado }` — o
 *    `uuid` aqui é o `uuid_cliente` do registro, não o `login` nem o `id`.
 *    Sem endpoint equivalente ao `radusuarios` do IXC (sessão RADIUS ao
 *    vivo) — `getConnectionStatus` usa `bloqueado` como proxy (bloqueio
 *    administrativo/financeiro, não sessão de rede em tempo real), mesma
 *    limitação já documentada nos outros adapters.
 *
 * `customerId`/`cpfOrId` nos métodos abaixo é tratado como o **login** do
 * MK-Auth — identificador estável aceito tanto pelos endpoints de título
 * quanto pelos de cliente (diferente do `id` numérico e do `uuid`, que só
 * aparecem dentro dos registros retornados).
 *
 * Autenticação (dois modos, mesmo padrão do Voalle/Hubsoft):
 *  1. `clientId` + `clientSecret` — troca via Basic Auth em GET /api/,
 *     cacheando o JWT (local + `tokenCache` Redis compartilhado, se
 *     injetado) até ~30s antes do `exp` decodificado do próprio token.
 *  2. `token` pré-gerado — usado direto como Bearer, sem exchange (só útil
 *     por pouco tempo dado o TTL curto do JWT, mas mantido por consistência).
 *
 * ⚠️ Sem validação ao vivo — nenhuma instância de teste gratuita encontrada
 * com "Controle de usuários" habilitado pra gerar Client_id/Client_secret
 * (ver CHECKLIST_PENDENCIAS_EXTERNAS.md). Reescrito mesmo assim por decisão
 * do Lucas (2026-08-29), mesmo tratamento dado ao Hubsoft.
 */
export class MKAuthAdapter implements ERPProvider {
  readonly name = 'mkauth' as const;

  private readonly baseUrl: string;
  private accessToken?: string;
  private tokenExpiresAt = 0;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
    private readonly tokenCache?: OAuthTokenCache,
  ) {
    const hasToken = !!creds?.token;
    const hasBasic = !!(creds?.clientId && creds?.clientSecret);
    if (!creds?.url || (!hasToken && !hasBasic)) {
      throw new Error('MK-Auth: credenciais ausentes (url + clientId/clientSecret OU token)');
    }
    this.baseUrl = normalizeErpBaseUrl(creds.url);
  }

  /** Lê o claim `exp` (unix seconds) de um JWT sem validar assinatura — só pra saber quando expira. */
  private static decodeJwtExpiry(jwt: string): number | null {
    try {
      const payload = jwt.split('.')[1];
      if (!payload) return null;
      const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
      return typeof json?.exp === 'number' ? json.exp : null;
    } catch {
      return null;
    }
  }

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

    const basic = Buffer.from(`${this.creds.clientId}:${this.creds.clientSecret}`).toString('base64');
    const res = await this.http(`${this.baseUrl}/api/`, {
      method: 'GET',
      headers: { Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`MK-Auth Auth Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    // A resposta é o JWT cru no corpo (texto puro), não um JSON com campo "token".
    const raw = await res.text?.();
    const jwt = String(raw ?? '').trim();
    if (!jwt) throw new Error('MK-Auth: autenticação não retornou token');
    this.accessToken = jwt;
    const exp = MKAuthAdapter.decodeJwtExpiry(jwt);
    // 30s de folga; sem `exp` decodificável, usa ~9m30s (o exemplo oficial tem 10min de TTL).
    const ttlSec = exp ? Math.max(0, exp - Math.floor(Date.now() / 1000) - 30) : 570;
    this.tokenExpiresAt = Date.now() + ttlSec * 1000;
    if (this.tokenCache) await this.tokenCache.set(jwt, ttlSec);
    return jwt;
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
      throw new Error(`MK-Auth API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    // Achado de auditoria 2026-08-28: painéis MK-Auth self-hosted às vezes
    // devolvem HTML/texto de erro de PHP com status 200 — res.json() cru dava
    // um SyntaxError opaco sem contexto.
    try {
      return await res.json();
    } catch {
      throw new Error(`MK-Auth: resposta não é JSON válido (${path}) — provável sessão expirada ou erro de painel`);
    }
  }

  private async put(path: string, body: unknown) {
    const res = await this.http(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: await this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`MK-Auth API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    try {
      return await res.json();
    } catch {
      throw new Error(`MK-Auth: resposta não é JSON válido (${path}) — provável sessão expirada ou erro de painel`);
    }
  }

  async findCustomerByCpf(cpf: string) {
    const clean = cpf.replace(/\D/g, '');
    return this.get(`/api/cliente/listar/cpf_cnpj=${clean}`);
  }

  async getBillingStatus(login: string) {
    return this.get(`/api/titulo/aberto/${encodeURIComponent(login)}`);
  }

  async generateSecondCopy(_customerId: string, invoiceId: string): Promise<SecondCopyResult> {
    const data = await this.get(`/api/titulo/show/${encodeURIComponent(invoiceId)}`);
    return {
      boletoUrl: data?.url ?? '',
      pixCopiaCola: data?.pix || data?.pix_link || '',
      barcode: data?.linhadig ?? '',
      dueDate: data?.datavenc ?? '',
      amountCents: parseAmountToCents(data?.valor ?? '0'),
    };
  }

  async getConnectionStatus(login: string): Promise<ConnectionStatus> {
    const data = await this.get(`/api/cliente/show/${encodeURIComponent(login)}`);
    const online = String(data?.bloqueado ?? '').trim().toLowerCase() !== 'sim';
    return { online, raw: data };
  }

  async unlockCustomer(login: string) {
    const cliente = await this.get(`/api/cliente/show/${encodeURIComponent(login)}`);
    const uuid = cliente?.uuid_cliente ?? cliente?.uuid;
    if (!uuid) throw new Error(`MK-Auth: cliente ${login} não encontrado (sem uuid para desbloquear)`);
    return this.put('/api/cliente/editar', { uuid, bloqueado: 'nao' });
  }
}
