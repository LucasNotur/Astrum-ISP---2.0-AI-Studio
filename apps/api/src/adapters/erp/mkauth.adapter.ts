import { parseAmountToCents, normalizeErpBaseUrl, readErpErrorBody, ERP_HTTP_TIMEOUT_MS, type ERPProvider, type ERPSalesCapable, type ERPCredentials, type HttpClient, type SecondCopyResult, type ConnectionStatus, type ViabilityResult, type ErpPlan, type LeadRegistration } from './erp.types';
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
 *
 * **P3 (funil de vendas) 2026-08-29** — lido o Swagger completo de novo atrás
 * dos 84 endpoints (não só os 6 já usados acima):
 *  - `getPlans`: `GET /api/plano/listar/pagina=1` — catálogo real de planos,
 *    `velup`/`veldown` em Kbps (confirmado: plano "RuraldeAltaVelocidade75Mbps"
 *    tem `veldown: "75000"` — bate exatamente dividindo por 1000).
 *  - `createPreRegistration`: `POST /api/cliente/inserir` — cria o cliente
 *    de verdade (MK-Auth não separa "lead" de "cliente"). Exige `Login` e
 *    `senha` (login/senha do PPPoE do cliente!) que a doc não documenta como
 *    opcionais — gerados aqui a partir do nome/CPF, já que `LeadRegistration`
 *    não tem esses campos. A resposta do insert **não devolve id nenhum**
 *    (só ecoa os campos enviados) — resolvido com `GET /api/cliente/show/
 *    {login}` logo em seguida pra pegar o `uuid_cliente` real (mesmo padrão
 *    já usado em `unlockCustomer`).
 *  - `checkViability`/`scheduleInstallation`: **não suportados**. Não existe
 *    endpoint de viabilidade por endereço nos 84 documentados. E embora exista
 *    `/api/instalacao/inserir` e `/api/chamado/inserir`, NENHUM dos dois tem
 *    campo de data/agendamento — `/api/instalacao/inserir` pede exatamente os
 *    mesmos campos de `/api/cliente/inserir` (é outra rota de cadastro, não
 *    agendamento) e `/api/chamado/inserir` exige um `login` de cliente já
 *    existente e só tem `assunto` (categoria livre) + `prioridade`, sem data.
 */
export class MKAuthAdapter implements ERPProvider, ERPSalesCapable {
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

  private async post(path: string, body: unknown) {
    const res = await this.http(`${this.baseUrl}${path}`, {
      method: 'POST',
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

  async checkViability(_address: string): Promise<ViabilityResult> {
    throw new Error('MK-Auth: checkViability não suportado — a API não documenta nenhum endpoint de viabilidade técnica por endereço');
  }

  /** `veldown`/`velup` em Kbps (confirmado no exemplo oficial da doc: 75000 = "75Mbps"). */
  async getPlans(): Promise<ErpPlan[]> {
    const data = await this.get('/api/plano/listar/pagina=1');
    const planos: any[] = data?.planos ?? [];
    return planos.map((p) => ({
      id: String(p?.uuid ?? ''),
      name: String(p?.nome ?? ''),
      downloadMbps: Number(p?.veldown ?? 0) / 1000,
      uploadMbps: Number(p?.velup ?? 0) / 1000,
      priceCents: parseAmountToCents(p?.valor ?? '0'),
      description: p?.descricao ?? undefined,
    }));
  }

  /** Gera login/senha a partir do nome/CPF — MK-Auth exige os dois no cadastro e `LeadRegistration` não os tem. */
  private static generateCredentials(data: LeadRegistration): { login: string; senha: string } {
    const slug = data.fullName
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
    const cpfSuffix = data.cpf.replace(/\D/g, '').slice(-4);
    const login = `${slug.slice(0, 12) || 'lead'}${cpfSuffix}`;
    const senha = Math.random().toString(36).slice(2, 10);
    return { login, senha };
  }

  /**
   * `POST /api/cliente/inserir` — não devolve id na resposta, só ecoa os
   * campos enviados. Busca o `uuid_cliente` real via `GET /cliente/show`
   * logo depois (mesmo padrão do `unlockCustomer`).
   */
  async createPreRegistration(data: LeadRegistration): Promise<{ leadId: string; externalId?: string }> {
    const { login, senha } = MKAuthAdapter.generateCredentials(data);
    await this.post('/api/cliente/inserir', {
      nome: data.fullName,
      Login: login,
      senha,
      email: data.email ?? '',
      cpf: data.cpf.replace(/\D/g, ''),
      endereco: data.address ?? '',
      telefone: data.phone,
      celular: data.phone,
    });
    const cliente = await this.get(`/api/cliente/show/${encodeURIComponent(login)}`);
    const uuid = cliente?.uuid_cliente ?? cliente?.uuid;
    if (!uuid) throw new Error(`MK-Auth: pré-cadastro criado (login ${login}) mas não foi possível confirmar o uuid`);
    return { leadId: String(uuid), externalId: login };
  }

  async scheduleInstallation(_leadId: string, _scheduledDate: string): Promise<{ orderId: string }> {
    throw new Error('MK-Auth: scheduleInstallation não suportado — nem /api/instalacao/inserir nem /api/chamado/inserir têm campo de data/agendamento');
  }
}
