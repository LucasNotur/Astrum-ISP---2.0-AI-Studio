import type { ERPProvider, ERPSalesCapable, ERPCredentials, HttpClient, SecondCopyResult, ConnectionStatus, ViabilityResult, ErpPlan, LeadRegistration } from './erp.types';
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
 *
 * P3 (funil de vendas) 2026-08-29 — a mesma collection oficial (189
 * endpoints) tem uma seção de prospecto/mapeamento inteira, com exemplo de
 * request/response real em cada um:
 *  - checkViability: POST /api/v1/integracao/mapeamento/viabilidade/consultar
 *    com {tipo_busca:"endereco", raio, endereco:{numero,endereco,bairro,
 *    cidade,estado}, detalhar_portas:true} — é o endpoint da própria Hubsoft
 *    (o resultado pode vir de um mapeamento local ou de integração externa
 *    tipo Geosite/OZMap configurada pelo tenant dentro do painel Hubsoft, mas
 *    a chamada em si não muda). Como checkViability(address) só recebe uma
 *    string, ela vai inteira em endereco.endereco (numero/bairro/cidade/
 *    estado ficam vazios) e raio usa o default de 250m do exemplo oficial.
 *    Resposta: resultado.projetos[].busca.elementos.data[] (uma "caixa
 *    óptica" por elemento, com disponiveis/id_caixa_optica) — achata todos
 *    os projetos e pega a caixa com mais portas livres.
 *  - getPlans: GET /api/v1/integracao/prospecto/create?cep=<cep> — catálogo
 *    de planos é POR CEP (faz sentido pra um ISP: cobertura difere por área),
 *    mas getPlans() não recebe endereço nenhum. Usa `creds.defaultCep`
 *    (opcional, configurável no wizard) como CEP de referência; sem ele,
 *    lança "não suportado sem CEP" em vez de inventar um. velocidade_download/
 *    upload vêm em Kbps (confirmado: "COMBO 10MB EM DOBRO" retorna 20480,
 *    exatamente 20 dividido por 1024 — bate com o "em dobro" da campanha).
 *  - createPreRegistration: POST /api/v1/integracao/prospecto — o mais bem
 *    documentado dos 3 ERPs com prospecto/lead nesta rodada (devolve
 *    `id_prospecto` de verdade, diferente de Voalle/MK-Auth). Precisa de
 *    `cep` — extraído do texto de `address` por regex (padrão brasileiro
 *    99999-999), com fallback pra `creds.defaultCep`. `servico.valor` não
 *    tem de onde vir em `LeadRegistration` (só tem `planId`) — enviado como
 *    0; o valor real do serviço já está cadastrado no Hubsoft pelo
 *    `id_servico`, então isso não impede o prospecto de ser criado, só deixa
 *    o campo de valor exibido zerado até alguém revisar manualmente.
 *  - scheduleInstallation: **não suportado** — abrir uma O.S. via API
 *    (`ordem_servico/abrir_os`) exige um `id_atendimento` já existente, que
 *    só existe depois que o prospecto é convertido em atendimento/cliente
 *    pelos processos internos do Hubsoft — não documentado nenhum endpoint
 *    de conversão direta `id_prospecto` → `id_atendimento`.
 */
export class HubsoftAdapter implements ERPProvider, ERPSalesCapable {
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

  async checkViability(address: string): Promise<ViabilityResult> {
    const data = await this.post('/api/v1/integracao/mapeamento/viabilidade/consultar', {
      tipo_busca: 'endereco',
      raio: 250,
      endereco: { numero: '', endereco: address, bairro: '', cidade: '', estado: '' },
      detalhar_portas: true,
    });
    const projetos: any[] = data?.resultado?.projetos ?? [];
    const elementos: any[] = projetos.flatMap((p) => p?.busca?.elementos?.data ?? []);
    const best = elementos.reduce((acc: any, el: any) => (Number(el?.disponiveis ?? 0) > Number(acc?.disponiveis ?? -1) ? el : acc), null);
    if (!best) return { available: false, raw: data };
    const availablePorts = Number(best?.disponiveis ?? 0);
    return {
      available: availablePorts > 0,
      ctoId: String(best?.id_caixa_optica ?? ''),
      ctoName: String(best?.caixa ?? ''),
      availablePorts,
      raw: data,
    };
  }

  /** Catálogo é por CEP — usa `creds.defaultCep` como referência (sem endereço aqui pra resolver um CEP real). */
  async getPlans(): Promise<ErpPlan[]> {
    const cep = String(this.creds.defaultCep ?? '').replace(/\D/g, '');
    if (!cep) throw new Error('Hubsoft: getPlans não suportado sem CEP — configure "defaultCep" na credencial (o catálogo do Hubsoft é por área de cobertura)');
    const data = await this.get(`/api/v1/integracao/prospecto/create?cep=${cep}`);
    const servicos: any[] = data?.servicos ?? [];
    return servicos.map((s) => ({
      id: String(s?.id_servico ?? ''),
      name: String(s?.descricao ?? ''),
      downloadMbps: Number(s?.velocidade_download ?? 0) / 1024,
      uploadMbps: Number(s?.velocidade_upload ?? 0) / 1024,
      priceCents: parseAmountToCents(s?.valor ?? 0),
    }));
  }

  /** CEP extraído de `address` (padrão 99999-999); cai pra `creds.defaultCep` se não achar. */
  async createPreRegistration(data: LeadRegistration): Promise<{ leadId: string; externalId?: string }> {
    const clean = data.cpf.replace(/\D/g, '');
    const cepMatch = (data.address ?? '').match(/(\d{5})-?(\d{3})/);
    const cep = cepMatch ? `${cepMatch[1]}${cepMatch[2]}` : String(this.creds.defaultCep ?? '').replace(/\D/g, '');
    const res = await this.post('/api/v1/integracao/prospecto', {
      cep,
      servico: { id_servico: data.planId, valor: 0 },
      cpf_cnpj: clean,
      telefone: data.phone,
      nome_razaosocial: data.fullName,
      tipo_pessoa: clean.length > 11 ? 'pj' : 'pf',
      bairro: '',
      endereco: data.address ?? '',
      numero: '',
    });
    if (res?.status === 'error') throw new Error(`Hubsoft: criação de prospecto falhou — ${res?.msg ?? 'erro desconhecido'}`);
    const id = String(res?.prospecto?.id_prospecto ?? '');
    if (!id) throw new Error('Hubsoft: criação de prospecto não retornou id_prospecto');
    return { leadId: id, externalId: id };
  }

  async scheduleInstallation(_leadId: string, _scheduledDate: string): Promise<{ orderId: string }> {
    throw new Error('Hubsoft: scheduleInstallation não suportado — abrir_os exige um id_atendimento já existente, sem endpoint documentado pra converter um prospecto em atendimento');
  }
}
