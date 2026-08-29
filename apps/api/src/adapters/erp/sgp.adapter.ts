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
 * ⚠️ NÃO confirmado (não implementado por incerteza — não adivinhado):
 * endpoint de desbloqueio de confiança. A doc do Whazing (parceiro que já
 * integra com SGP) trata "2ª via de boleto" e "Desbloqueio de confiança"
 * como DUAS integrações separadas, confirmando que existe um endpoint
 * dedicado — mas nenhum dos nomes óbvios testados contra o demo
 * (`/api/ura/desbloqueio/`, `/api/ura/confianca/`, `/api/ura/trust/`, etc.)
 * existe. `unlockCustomer` lança em vez de adivinhar.
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
    const online = contratos.some((c) => c?.status === 'Ativo');
    return { online, raw: cliente };
  }

  async unlockCustomer(_cpf: string): Promise<never> {
    throw new Error(
      'SGP: endpoint de desbloqueio de confiança não confirmado contra a API real — ' +
      'ver CHECKLIST_PENDENCIAS_EXTERNAS.md antes de implementar (não adivinhar).',
    );
  }
}
