import type { ERPProvider, ERPCredentials, HttpClient, SecondCopyResult, ConnectionStatus } from './erp.types';
import { parseAmountToCents, normalizeErpBaseUrl, readErpErrorBody, ERP_HTTP_TIMEOUT_MS } from './erp.types';
import type { OAuthTokenCache } from './erp-oauth-cache.service';

/**
 * P0-05 — Hubsoft adapter.
 *
 * Endpoints de negócio reescritos 2026-08-29 — a versão anterior usava paths
 * inventados (`/api/v1/clientes`, `/api/v1/financeiro/cobrancas/.../segunda-via`)
 * que não existem. Confirmado contra a **collection Postman oficial publicada**
 * (docs.hubsoft.com.br → `/api/collections/23327122/2sA35LUysW`, baixada e lida
 * por inteiro — 189 endpoints, com request/response de exemplo reais, timestamps
 * de julho/2026 — não é doc estática, é regenerada de uma conta de teste viva):
 *
 *  - Clientes: `GET /api/v1/integracao/cliente?busca=cpf_cnpj&termo_busca=<cpf>`
 *    (busca também aceita `id_cliente_servico`, `codigo_cliente`, etc.).
 *  - Financeiro: `GET /api/v1/integracao/cliente/financeiro?busca=id_cliente_servico&termo_busca=<id>`
 *    — as faturas JÁ vêm com boleto pronto (`link`), linha digitável
 *    (`linha_digitavel`) e PIX (`pix_copia_cola`) — **não existe endpoint de
 *    "gerar 2ª via"**, é só filtrar a fatura certa na lista.
 *  - Conexão: não existe "status ao vivo" dedicado — `busca=id_cliente_servico&
 *    ultima_conexao=sim` embute o último acct RADIUS
 *    (`servicos[].ultima_conexao.conectado`) na mesma consulta de cliente.
 *  - Desbloqueio: `POST /api/v1/integracao/cliente/desbloqueio_confianca` com
 *    `{ id_cliente_servico, dias_desbloqueio }`.
 *
 * `customerId`/`idClienteServico` nos métodos abaixo é o `id_cliente_servico`
 * (identificador do SERVIÇO/plano, não do cliente — um `id_cliente` pode ter
 * vários `id_cliente_servico`) — é o que financeiro/conexão/desbloqueio usam
 * como chave de busca na API real.
 *
 * ⚠️ Ainda sem validação ao vivo de verdade (sem credencial de tenant real) —
 * o request de auth foi testado contra `api.dev.hubsoft.com.br` com as
 * credenciais de exemplo da doc antiga (resultado: 401 — credenciais mortas,
 * mas confirma que a URL/formato do request estão certos, servidor responde
 * de verdade). Os endpoints de negócio acima vêm da collection oficial, não
 * foram exercitados contra um tenant real.
 *
 * Autenticação (dois modos, mesmo padrão do VoalleAdapter) — validada contra
 * a mesma collection oficial, response shape bate exatamente com o código:
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
    return this.get(`/api/v1/integracao/cliente?busca=cpf_cnpj&termo_busca=${clean}`);
  }

  async getBillingStatus(idClienteServico: string) {
    return this.get(
      `/api/v1/integracao/cliente/financeiro?busca=id_cliente_servico&termo_busca=${encodeURIComponent(idClienteServico)}&apenas_pendente=sim`,
    );
  }

  async generateSecondCopy(idClienteServico: string, invoiceId: string): Promise<SecondCopyResult> {
    // Não existe endpoint de "gerar 2ª via" — o boleto/PIX já vêm prontos na
    // consulta de faturas (campos `link`, `linha_digitavel`, `pix_copia_cola`).
    // apenas_pendente=nao pra achar a fatura mesmo que já tenha sido paga.
    const data = await this.get(
      `/api/v1/integracao/cliente/financeiro?busca=id_cliente_servico&termo_busca=${encodeURIComponent(idClienteServico)}&apenas_pendente=nao&limit=50`,
    );
    const faturas: any[] = data?.faturas ?? [];
    const fatura = faturas.find((f) => String(f?.id_fatura) === String(invoiceId));
    if (!fatura) {
      throw new Error(`Hubsoft: fatura ${invoiceId} não encontrada para o serviço ${idClienteServico}`);
    }
    return {
      boletoUrl: fatura?.link ?? '',
      pixCopiaCola: fatura?.pix_copia_cola ?? '',
      barcode: fatura?.linha_digitavel ?? '',
      dueDate: fatura?.data_vencimento ?? '',
      amountCents: parseAmountToCents(fatura?.valor ?? 0),
    };
  }

  async getConnectionStatus(idClienteServico: string): Promise<ConnectionStatus> {
    // `ultima_conexao=sim` embute o status de conexão RADIUS mais recente
    // (`servicos[].ultima_conexao.conectado`) direto na consulta de cliente —
    // não existe um "status ao vivo" separado, é o último acct do RADIUS.
    const data = await this.get(
      `/api/v1/integracao/cliente?busca=id_cliente_servico&termo_busca=${encodeURIComponent(idClienteServico)}&ultima_conexao=sim`,
    );
    const clientes: any[] = data?.clientes ?? [];
    const servico = clientes
      .flatMap((c) => c?.servicos ?? [])
      .find((s: any) => String(s?.id_cliente_servico) === String(idClienteServico));
    if (!servico) throw new Error(`Hubsoft: serviço ${idClienteServico} não encontrado`);
    return { online: servico?.ultima_conexao?.conectado === true, raw: data };
  }

  async unlockCustomer(idClienteServico: string) {
    return this.post('/api/v1/integracao/cliente/desbloqueio_confianca', {
      id_cliente_servico: idClienteServico,
      dias_desbloqueio: '1',
    });
  }
}
