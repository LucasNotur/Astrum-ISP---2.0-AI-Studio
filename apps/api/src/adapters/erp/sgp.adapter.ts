import type { ERPProvider, ERPCredentials, HttpClient, SecondCopyResult, ConnectionStatus } from './erp.types';
import { parseAmountToCents, normalizeErpBaseUrl, readErpErrorBody, ERP_HTTP_TIMEOUT_MS } from './erp.types';

/**
 * P0-04 — SGP/TSMX adapter.
 *
 * ✅ Validado ao vivo 2026-08-28 contra o ambiente de demonstração público e
 * self-service da TSMX (demo.sgp.net.br, dados fictícios isolados de
 * produção). Substitui a versão anterior, que tinha endpoints/formato de
 * autenticação inteiramente adivinhados — a auditoria estática só suspeitava
 * que faltava um `app`; testando de verdade descobrimos que TAMBÉM estava
 * errado o formato do corpo (era JSON, precisa ser form-data), o método de
 * auth (era header, precisa ir no corpo), e todos os 5 paths de endpoint.
 *
 * CONTRATO REAL CONFIRMADO (doc oficial: bookstack.sgp.net.br/books/api +
 * teste ao vivo):
 * - Autenticação: `token` (gerado em Administração → Integrações → Tokens) +
 *   `app` (nome EXATO da Aplicação vinculada ao token, case-sensitive — ex.:
 *   "Chatbot", não "chatbot") — ambos enviados como campos do form-data no
 *   corpo, não como header.
 * - Único endpoint de consulta: `POST /api/ura/clientes/` com o campo
 *   `cpfcnpj` (sem máscara, sem underscore no nome do campo) — devolve o
 *   cliente inteiro (dados cadastrais + TODOS os contratos + TODOS os
 *   títulos/boletos) numa resposta só. Sem filtro de `cpfcnpj`, devolve a
 *   base inteira do provedor — sempre filtrar.
 * - Não existe endpoint de busca por ID: a API só busca por CPF/CNPJ. Por
 *   isso, para este adapter, TODOS os parâmetros "customerId" da interface
 *   `ERPProvider` são interpretados como CPF/CNPJ — é a única chave que a
 *   API real aceita. O chamador (`tools.executor.ts`) hoje passa o
 *   `customers.id` interno do Astrum, não o CPF — precisa resolver o CPF
 *   (`customers.cpf`) antes de chamar este adapter quando o provider for
 *   'sgp'. Isso é o mesmo gap já registrado no CHECKLIST_PENDENCIAS_EXTERNAS
 *   sobre `customers.cpf`/`legacy_id`, não um bug novo deste adapter.
 *
 * ✅ RESOLVIDO 2026-08-29 — endpoint de desbloqueio achado. O nome real na
 * doc/API é "Liberação por Confiança" (não "desbloqueio de confiança" — por
 * isso a busca textual por "desbloqueio"/"confiança" no bookstack.sgp.net.br
 * não achava nada; o termo usado é outro). Achado na collection Postman
 * oficial (`documenter.getpostman.com/view/6682240/2sB34hHg2V`, linkada em
 * `tsmx.net.br/developers`): `POST /api/ura/liberacaopromessa/`, form-data
 * com `token`+`app`+`contrato` (**ID do contrato, não CPF**). `unlockCustomer`
 * resolve isso sozinho: busca o cliente por CPF (mesma chamada de sempre),
 * pega `contratos[0].contrato`, então libera. Existe uma versão paralela em
 * `/api/central/promessapagamento/` (categoria "Central Assinante", auth por
 * CPF+senha do cliente final, não Token/App) — não usada aqui.
 *
 * ✅ MELHORADO 2026-08-29 — `getConnectionStatus` usava só o status
 * administrativo do contrato (Ativo/Bloqueado) como proxy, mesma limitação
 * dos outros adapters. A collection oficial revelou que a resposta de
 * `/api/ura/clientes/` **já inclui sessão RADIUS real** por serviço em
 * `contratos[].servicos[].onu.conexao.status` (`"online"`/outro) quando o
 * serviço é FTTH/ONU-gerenciada — não é mais proxy, é status de conexão de
 * verdade quando disponível. Cai pro status administrativo do contrato só
 * quando nenhum serviço tem esse campo (ex.: contratos não-FTTH).
 */
export class SGPAdapter implements ERPProvider {
  readonly name = 'sgp' as const;

  private readonly baseUrl: string;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token || !creds?.app) {
      throw new Error('SGP: credenciais ausentes (url + token + app)');
    }
    this.baseUrl = normalizeErpBaseUrl(creds.url);
  }

  /** POST form-data (multipart) — a API real rejeita JSON. Confirmado ao vivo. */
  private async postForm(path: string, params: Record<string, string>) {
    const form = new FormData();
    form.append('token', String(this.creds.token));
    form.append('app', String(this.creds.app));
    for (const [k, v] of Object.entries(params)) form.append(k, v);

    const res = await this.http(`${this.baseUrl}${path}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(ERP_HTTP_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await readErpErrorBody(res);
      throw new Error(`SGP API Error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
    }
    return res.json();
  }

  /**
   * Único ponto real de consulta — devolve o cliente completo (contratos +
   * títulos) filtrado por CPF/CNPJ, ou `null` se não encontrado.
   */
  private async fetchCliente(cpfOrCnpj: string): Promise<any | null> {
    const clean = cpfOrCnpj.replace(/\D/g, '');
    const data = await this.postForm('/api/ura/clientes/', { cpfcnpj: clean });
    return data?.clientes?.[0] ?? null;
  }

  async findCustomerByCpf(cpf: string) {
    return this.fetchCliente(cpf);
  }

  async getBillingStatus(cpf: string) {
    const cliente = await this.fetchCliente(cpf);
    if (!cliente) throw new Error(`SGP: cliente não encontrado para o CPF/CNPJ informado`);
    return cliente.titulos ?? [];
  }

  async generateSecondCopy(cpf: string, invoiceId: string): Promise<SecondCopyResult> {
    const cliente = await this.fetchCliente(cpf);
    if (!cliente) throw new Error(`SGP: cliente não encontrado para o CPF/CNPJ informado`);
    const titulos: any[] = cliente.titulos ?? [];
    const target = titulos.find((t) => String(t?.id) === String(invoiceId));
    if (!target) {
      throw new Error(`SGP: título ${invoiceId} não encontrado para este cliente`);
    }
    return {
      boletoUrl: target.link ?? '',
      pixCopiaCola: target.codigoPix ?? '',
      barcode: target.linhaDigitavel ?? target.codigoBarras ?? '',
      dueDate: target.dataVencimento ?? '',
      amountCents: parseAmountToCents(target.valorCorrigido ?? target.valor ?? '0'),
    };
  }

  async getConnectionStatus(cpf: string): Promise<ConnectionStatus> {
    const cliente = await this.fetchCliente(cpf);
    if (!cliente) throw new Error(`SGP: cliente não encontrado para o CPF/CNPJ informado`);
    const contratos: any[] = cliente.contratos ?? [];
    const servicos = contratos.flatMap((c) => c?.servicos ?? []);
    const conexoes = servicos.map((s) => s?.onu?.conexao?.status).filter((s) => s != null);
    // Sessão RADIUS real (FTTH/ONU) quando disponível; senão, status
    // administrativo do contrato como proxy (mesma limitação dos outros ERPs).
    const online = conexoes.length > 0
      ? conexoes.some((s) => String(s).toLowerCase() === 'online')
      : contratos.some((c) => c?.status === 'Ativo');
    return { online, raw: cliente };
  }

  /**
   * `contrato` = id do primeiro contrato do cliente resolvido por CPF — a API
   * de liberação exige o ID do contrato, não o CPF. Usa o primeiro contrato;
   * a maioria dos clientes tem só um. Campo lido com fallback: a resposta
   * real testada ao vivo em 2026-08-28 usa `contratos[].id`, mas o exemplo da
   * collection Postman oficial usa `contratos[].contrato` — sem poder testar
   * `liberacaopromessa` ao vivo pra confirmar qual vale aqui, aceita os dois.
   * `liberado: false` na resposta não é erro HTTP (a API sempre responde
   * 200), então checamos o campo explicitamente.
   */
  async unlockCustomer(cpf: string) {
    const cliente = await this.fetchCliente(cpf);
    if (!cliente) throw new Error(`SGP: cliente não encontrado para o CPF/CNPJ informado`);
    const contrato = cliente.contratos?.[0]?.contrato ?? cliente.contratos?.[0]?.id;
    if (!contrato) throw new Error(`SGP: cliente sem contrato para liberação por confiança`);
    const data = await this.postForm('/api/ura/liberacaopromessa/', { contrato: String(contrato) });
    if (!data?.liberado) {
      throw new Error(`SGP: liberação por confiança não concedida — ${data?.msg ?? 'motivo não informado'}`);
    }
    return data;
  }
}
