/**
 * Dossiê #23 — Emissão de Notas Fiscais.
 * Gerencia ciclo de vida de NF-e/NFS-e para faturas SaaS:
 * geração, envio à prefeitura, cancelamento e consulta de status.
 */

export type NfStatus = 'pending' | 'processing' | 'authorized' | 'rejected' | 'cancelled';

export interface NotaFiscal {
  id: string;
  tenantId: string;
  invoiceId: string;
  type: 'nfse' | 'nfe';
  number?: string;
  series?: string;
  accessKey?: string;
  status: NfStatus;
  xmlUrl?: string;
  pdfUrl?: string;
  rejectionReason?: string;
  issuedAt?: string;
  createdAt: string;
}

export interface NfIssueRequest {
  tenantId: string;
  invoiceId: string;
  type: 'nfse' | 'nfe';
  customerCpfCnpj: string;
  customerName: string;
  description: string;
  amount: number;
  issRate?: number;
}

export interface NfPorts {
  getByInvoice: (tenantId: string, invoiceId: string) => Promise<NotaFiscal | null>;
  create: (nf: Omit<NotaFiscal, 'id' | 'createdAt'>) => Promise<NotaFiscal>;
  updateStatus: (id: string, status: NfStatus, data?: Partial<NotaFiscal>) => Promise<NotaFiscal>;
  submitToSefaz: (nf: NotaFiscal, req: NfIssueRequest) => Promise<{ authorized: boolean; number?: string; accessKey?: string; xmlUrl?: string; pdfUrl?: string; rejectionReason?: string }>;
  cancelAtSefaz: (nf: NotaFiscal, reason: string) => Promise<{ cancelled: boolean; error?: string }>;
}

export function validateCpfCnpj(doc: string): boolean {
  const clean = doc.replace(/\D/g, '');
  return clean.length === 11 || clean.length === 14;
}

export function calculateIss(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

export async function issueNotaFiscal(
  req: NfIssueRequest,
  ports: NfPorts,
): Promise<{ ok: boolean; nf?: NotaFiscal; error?: string }> {
  if (!validateCpfCnpj(req.customerCpfCnpj)) {
    return { ok: false, error: 'CPF/CNPJ inválido' };
  }
  if (req.amount <= 0) {
    return { ok: false, error: 'Valor deve ser positivo' };
  }

  const existing = await ports.getByInvoice(req.tenantId, req.invoiceId);
  if (existing && (existing.status === 'authorized' || existing.status === 'processing')) {
    return { ok: false, error: `NF já existe com status ${existing.status}` };
  }

  const nf = await ports.create({
    tenantId: req.tenantId,
    invoiceId: req.invoiceId,
    type: req.type,
    status: 'processing',
  });

  try {
    const result = await ports.submitToSefaz(nf, req);
    if (result.authorized) {
      const updated = await ports.updateStatus(nf.id, 'authorized', {
        number: result.number,
        accessKey: result.accessKey,
        xmlUrl: result.xmlUrl,
        pdfUrl: result.pdfUrl,
        issuedAt: new Date().toISOString(),
      });
      return { ok: true, nf: updated };
    }
    const rejected = await ports.updateStatus(nf.id, 'rejected', {
      rejectionReason: result.rejectionReason,
    });
    return { ok: false, nf: rejected, error: result.rejectionReason };
  } catch (err) {
    await ports.updateStatus(nf.id, 'rejected', {
      rejectionReason: (err as Error).message,
    });
    return { ok: false, error: (err as Error).message };
  }
}

export async function cancelNotaFiscal(
  tenantId: string,
  invoiceId: string,
  reason: string,
  ports: NfPorts,
): Promise<{ ok: boolean; error?: string }> {
  const nf = await ports.getByInvoice(tenantId, invoiceId);
  if (!nf) return { ok: false, error: 'NF não encontrada' };
  if (nf.status !== 'authorized') return { ok: false, error: `Só é possível cancelar NF autorizada (status atual: ${nf.status})` };
  if (!reason || reason.length < 15) return { ok: false, error: 'Motivo de cancelamento deve ter pelo menos 15 caracteres' };

  const result = await ports.cancelAtSefaz(nf, reason);
  if (result.cancelled) {
    await ports.updateStatus(nf.id, 'cancelled');
    return { ok: true };
  }
  return { ok: false, error: result.error };
}
