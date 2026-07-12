import { parseAmountToCents, type ERPProvider, type ERPSalesCapable, type ERPOperationsCapable, type ERPCredentials, type HttpClient, type SecondCopyResult, type ConnectionStatus, type ViabilityResult, type ErpPlan, type LeadRegistration } from './erp.types';

/**
 * IXC Adapter — port de src/lib/integrations/ixcClient.ts para apps/api.
 * HTTP injetável para teste; normaliza a 2ª via (boleto/pix) para o formato comum.
 */
export class IXCAdapter implements ERPProvider, ERPSalesCapable, ERPOperationsCapable {
  readonly name = 'ixc' as const;

  constructor(
    private readonly creds: ERPCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.url || !creds?.token) throw new Error('IXC: credenciais ausentes');
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(this.creds.token).toString('base64')}`,
      ...extra,
    };
  }

  private async post(path: string, body: unknown, listar = true) {
    const res = await this.http(`${this.creds.url}${path}`, {
      method: 'POST',
      headers: this.headers(listar ? { ixcsoft: 'listar' } : {}),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`IXC API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async findCustomerByCpf(cpf: string) {
    return this.post('/webservice/v1/cliente', {
      qtype: 'cliente.cnpj_cpf', query: cpf.replace(/\D/g, ''), oper: '=', page: '1', rp: '20',
      sortname: 'cliente.id', sortorder: 'desc',
    });
  }

  async getBillingStatus(customerId: string) {
    return this.post('/webservice/v1/fn_areceber', {
      qtype: 'fn_areceber.id_cliente', query: customerId, oper: '=', page: '1', rp: '50',
      sortname: 'fn_areceber.data_vencimento', sortorder: 'asc',
    });
  }

  async getConnectionStatus(customerId: string): Promise<ConnectionStatus> {
    const data = await this.post('/webservice/v1/radusuarios', {
      qtype: 'radusuarios.id_cliente', query: customerId, oper: '=', page: '1', rp: '20',
      sortname: 'radusuarios.id', sortorder: 'desc',
    });
    const rows = data?.registros ?? [];
    const online = rows.some((r: any) => r?.online === 'S' || r?.status === 'online');
    return { online, raw: data };
  }

  async generateSecondCopy(_customerId: string, invoiceId: string): Promise<SecondCopyResult> {
    const data = await this.post('/webservice/v1/get_boleto', {
      boletos: invoiceId, juros: 'S', multa: 'S', atualiza_boleto: 'S', tipo_boleto: 'link',
    }, false);
    return normalizeIxcSecondCopy(data);
  }

  async unlockCustomer(customerId: string) {
    return this.post('/webservice/v1/cliente_desbloqueio_confianca', { id_cliente: customerId }, false);
  }

  // ── P0-06 — ERPOperationsCapable ───────────────────────────────────────────

  async suspendCustomer(customerId: string, reason?: string): Promise<{ success: boolean; raw?: unknown }> {
    // IXC: suspensão de contrato via desbloqueio reverso — endpoint de suspensão
    // parcial do contrato do cliente (mesmo domínio do desbloqueio de confiança).
    const raw = await this.post('/webservice/v1/cliente_contrato_btn_susp_parc', {
      id_contrato: customerId,
      motivo: reason ?? 'Suspensão automática (CobrAI)',
    }, false);
    const success = String(raw?.type ?? raw?.status ?? '').toLowerCase() !== 'error';
    return { success, raw };
  }

  async createServiceOrder(data: { customerId: string; description: string; scheduledFor?: string }): Promise<{ orderId: string; raw?: unknown }> {
    const raw = await this.post('/webservice/v1/su_oss_chamado', {
      id_cliente: data.customerId,
      tipo: 'C', // C = corretiva (visita técnica)
      mensagem: data.description,
      status: 'A', // A = Aberta
      data_abertura: new Date().toISOString().slice(0, 10),
      ...(data.scheduledFor ? { data_agenda: data.scheduledFor.slice(0, 10) } : {}),
    }, false);
    const orderId = String(raw?.id ?? raw?.id_chamado ?? '');
    if (!orderId) throw new Error('IXC: abertura de OS não retornou id');
    return { orderId, raw };
  }

  // ── P3 — ERPSalesCapable ───────────────────────────────────────────────────

  async checkViability(address: string): Promise<ViabilityResult> {
    const data = await this.post('/webservice/v1/viabilidade', {
      qtype: 'viabilidade.endereco', query: address, oper: 'like', page: '1', rp: '5',
      sortname: 'viabilidade.id', sortorder: 'desc',
    });
    const rows: any[] = data?.registros ?? [];
    if (!rows.length) return { available: false, raw: data };
    const first = rows[0];
    const availablePorts = Number(first?.portas_disponiveis ?? first?.available_ports ?? 0);
    return {
      available: availablePorts > 0,
      ctoId: String(first?.id_cto ?? first?.cto_id ?? ''),
      ctoName: String(first?.cto ?? first?.cto_name ?? ''),
      availablePorts,
      raw: data,
    };
  }

  async getPlans(): Promise<ErpPlan[]> {
    const data = await this.post('/webservice/v1/plano_acesso', {
      qtype: 'plano_acesso.ativo', query: '1', oper: '=', page: '1', rp: '100',
      sortname: 'plano_acesso.valor', sortorder: 'asc',
    });
    const rows: any[] = data?.registros ?? [];
    return rows.map(normalizeIxcPlan);
  }

  async createPreRegistration(data: LeadRegistration): Promise<{ leadId: string; externalId?: string }> {
    const res = await this.post('/webservice/v1/cliente', {
      razao: data.fullName,
      cnpj_cpf: data.cpf.replace(/\D/g, ''),
      email: data.email ?? '',
      fone_celular: data.phone.replace(/\D/g, ''),
      endereco: data.address,
      id_plano: data.planId,
      ativo: 'N', // pré-cadastro: inativo até instalação
    }, false);
    const id = String(res?.id ?? res?.id_cliente ?? '');
    if (!id) throw new Error('IXC: pré-cadastro não retornou id');
    return { leadId: id, externalId: id };
  }

  async scheduleInstallation(leadId: string, scheduledDate: string): Promise<{ orderId: string }> {
    const res = await this.post('/webservice/v1/os', {
      id_cliente: leadId,
      tipo: 'I', // I = instalação
      assunto: 'Instalação de internet',
      status: 'A', // A = Aberta
      data_abertura: new Date().toISOString().slice(0, 10),
      data_prevista: scheduledDate,
    }, false);
    const id = String(res?.id ?? res?.id_os ?? '');
    if (!id) throw new Error('IXC: agendamento não retornou id_os');
    return { orderId: id };
  }
}

function normalizeIxcPlan(r: any): ErpPlan {
  return {
    id: String(r?.id ?? ''),
    name: String(r?.nome ?? r?.descricao ?? ''),
    downloadMbps: Number(r?.velocidade_download ?? r?.download ?? 0),
    uploadMbps: Number(r?.velocidade_upload ?? r?.upload ?? 0),
    priceCents: parseAmountToCents(r?.valor ?? r?.valor_plano ?? '0'),
    description: r?.obs ?? r?.descricao_completa ?? undefined,
  };
}

/** Normaliza a resposta de 2ª via do IXC para o formato comum (reais → centavos). */
export function normalizeIxcSecondCopy(data: any): SecondCopyResult {
  return {
    boletoUrl: data?.url ?? data?.link ?? data?.boleto_url ?? '',
    pixCopiaCola: data?.pix ?? data?.pix_copia_cola ?? data?.qrcode ?? '',
    barcode: data?.linha_digitavel ?? data?.barcode ?? '',
    dueDate: data?.data_vencimento ?? data?.due_date ?? '',
    amountCents: parseAmountToCents(data?.valor ?? data?.amount ?? '0'),
  };
}
