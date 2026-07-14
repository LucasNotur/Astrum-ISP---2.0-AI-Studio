/**
 * H6-03 / F6-02 — Adapter Asaas (gateway de cobrança).
 *
 * Dupla função na Constelação (PLANO_H):
 *  · Gênesis/ISP: puxa cobranças e inadimplentes de quem usa Asaas em vez de ERP;
 *  · Astrum Cobra: é O conector do produto de cobrança universal (academia,
 *    escola, clínica — qualquer mensalidade que viva no Asaas).
 *
 * API: https://api.asaas.com/v3 (sandbox: api-sandbox.asaas.com). Auth via
 * header `access_token`. HTTP injetável (mesma disciplina dos adapters ERP).
 */
import { parseAmountToCents, type HttpClient } from '../erp/erp.types';

export interface AsaasCredentials {
  apiKey: string;
  /** true = sandbox (api-sandbox.asaas.com). Default false. */
  sandbox?: boolean;
}

export type AsaasPaymentStatus =
  | 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE'
  | 'REFUNDED' | 'RECEIVED_IN_CASH' | 'CHARGEBACK_REQUESTED';

/** Cobrança normalizada — o formato que o CobrAI/invoices entende. */
export interface AsaasCharge {
  externalId: string;
  customerExternalId: string;
  amountCents: number;
  status: 'paid' | 'overdue' | 'pending';
  dueDate: string;              // YYYY-MM-DD
  paidAt: string | null;
  invoiceUrl: string | null;    // link da fatura (a "2ª via" do Asaas)
  pixCopyPaste: string | null;
}

export interface AsaasCustomer {
  externalId: string;
  name: string;
  cpfCnpj: string | null;
  phone: string | null;
  email: string | null;
}

function mapStatus(s: AsaasPaymentStatus): AsaasCharge['status'] {
  if (s === 'RECEIVED' || s === 'CONFIRMED' || s === 'RECEIVED_IN_CASH') return 'paid';
  if (s === 'OVERDUE') return 'overdue';
  return 'pending';
}

export class AsaasAdapter {
  readonly name = 'asaas' as const;
  private readonly baseUrl: string;

  constructor(
    private readonly creds: AsaasCredentials,
    private readonly http: HttpClient = fetch as unknown as HttpClient,
  ) {
    if (!creds?.apiKey) throw new Error('Asaas: apiKey ausente');
    this.baseUrl = creds.sandbox ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
  }

  private async get(path: string): Promise<any> {
    const res = await this.http(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', access_token: this.creds.apiKey },
    });
    if (!res.ok) throw new Error(`Asaas API Error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /** Pagina TODAS as cobranças de um status (o Asaas pagina de 100 em 100). */
  async listCharges(status?: AsaasPaymentStatus, maxPages = 20): Promise<AsaasCharge[]> {
    const out: AsaasCharge[] = [];
    for (let page = 0; page < maxPages; page++) {
      const q = `${status ? `status=${status}&` : ''}limit=100&offset=${page * 100}`;
      const data = await this.get(`/payments?${q}`);
      const rows: any[] = data?.data ?? [];
      for (const r of rows) {
        out.push({
          externalId: String(r.id),
          customerExternalId: String(r.customer ?? ''),
          amountCents: parseAmountToCents(r.value ?? 0),
          status: mapStatus(r.status as AsaasPaymentStatus),
          dueDate: String(r.dueDate ?? ''),
          paidAt: r.paymentDate ? String(r.paymentDate) : null,
          invoiceUrl: r.invoiceUrl ?? r.bankSlipUrl ?? null,
          pixCopyPaste: r.pixTransaction?.qrCode?.payload ?? null,
        });
      }
      if (!data?.hasMore) break;
    }
    return out;
  }

  /** O prato principal do Radar/Cobra: quem está devendo AGORA. */
  async listOverdue(): Promise<AsaasCharge[]> {
    return this.listCharges('OVERDUE');
  }

  async listCustomers(maxPages = 20): Promise<AsaasCustomer[]> {
    const out: AsaasCustomer[] = [];
    for (let page = 0; page < maxPages; page++) {
      const data = await this.get(`/customers?limit=100&offset=${page * 100}`);
      const rows: any[] = data?.data ?? [];
      for (const r of rows) {
        out.push({
          externalId: String(r.id),
          name: String(r.name ?? ''),
          cpfCnpj: r.cpfCnpj ?? null,
          phone: r.mobilePhone ?? r.phone ?? null,
          email: r.email ?? null,
        });
      }
      if (!data?.hasMore) break;
    }
    return out;
  }
}
