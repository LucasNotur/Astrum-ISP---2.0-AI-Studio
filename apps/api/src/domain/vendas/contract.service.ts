/**
 * P3-03 — Contrato digital.
 *
 * Envia o contrato para assinatura via Clicksign ou D4Sign.
 * Fail-open: sem CLICKSIGN_API_KEY/D4SIGN_API_KEY configura `contract_status = 'pending_signature'`
 * e retorna sem erro — o operador acompanha pelo painel do provedor de assinatura.
 */
import { infraLogger } from '../../infrastructure/logging/logger';

export type ContractProvider = 'clicksign' | 'd4sign' | 'none';

export interface ContractRequest {
  tenantId: string;
  leadId: string;
  signerName: string;
  signerCpf: string;
  signerEmail?: string;
  signerPhone?: string;
  address: string;
  planName: string;
  planPriceCents: number;
}

export interface ContractResult {
  status: 'sent' | 'pending_signature' | 'failed';
  provider: ContractProvider;
  contractUrl?: string;
  externalKey?: string;
  message?: string;
}

// ── Injeção de dependências ───────────────────────────────────────────────────

export interface ContractHttpClient {
  post: (url: string, payload: unknown, headers: Record<string, string>) => Promise<{ ok: boolean; data: any }>;
}

const defaultHttp: ContractHttpClient = {
  async post(url, payload, headers) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: await res.json().catch(() => null) };
  },
};

// ── Implementação ─────────────────────────────────────────────────────────────

export async function sendContract(
  req: ContractRequest,
  http: ContractHttpClient = defaultHttp,
): Promise<ContractResult> {
  const clicksignKey = process.env.CLICKSIGN_API_KEY;
  const d4signKey = process.env.D4SIGN_API_KEY;

  if (clicksignKey) return sendViaClicksign(req, clicksignKey, http);
  if (d4signKey) return sendViaD4sign(req, d4signKey, http);

  // Nenhuma chave configurada — retorna pending sem erro.
  infraLogger.info(
    { leadId: req.leadId, tenantId: req.tenantId },
    'Contrato: nenhuma chave de assinatura digital configurada — status pending_signature',
  );
  return { status: 'pending_signature', provider: 'none', message: 'Configurar CLICKSIGN_API_KEY ou D4SIGN_API_KEY' };
}

async function sendViaClicksign(
  req: ContractRequest,
  apiKey: string,
  http: ContractHttpClient,
): Promise<ContractResult> {
  const url = 'https://app.clicksign.com/api/v1/documents';
  try {
    const { ok, data } = await http.post(
      `${url}?access_token=${apiKey}`,
      {
        document: {
          path: `/contratos/${req.tenantId}/${req.leadId}.pdf`,
          content_base64: buildContractBase64(req),
          deadline_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          sequence_enabled: false,
          signers: [
            {
              name: req.signerName,
              email: req.signerEmail ?? '',
              phone_number: req.signerPhone?.replace(/\D/g, '') ?? '',
              has_documentation: true,
              documentation: req.signerCpf.replace(/\D/g, ''),
              delivery: 'email',
              act: '1',
            },
          ],
        },
      },
      {},
    );

    if (!ok) throw new Error(`Clicksign: status não-ok`);
    const key = data?.document?.key ?? '';
    const contractUrl = `https://app.clicksign.com/${key}`;
    return { status: 'sent', provider: 'clicksign', contractUrl, externalKey: key };
  } catch (err) {
    infraLogger.warn({ err: (err as Error).message, leadId: req.leadId }, 'Clicksign falhou — pending_signature');
    return { status: 'failed', provider: 'clicksign', message: (err as Error).message };
  }
}

async function sendViaD4sign(
  req: ContractRequest,
  apiKey: string,
  http: ContractHttpClient,
): Promise<ContractResult> {
  const url = 'https://secure.d4sign.com.br/api/v1';
  try {
    const { ok, data } = await http.post(
      `${url}/documents/upload?tokenAPI=${apiKey}`,
      {
        base64_binary_file: buildContractBase64(req),
        mime_type: 'application/pdf',
        name: `Contrato_${req.leadId}.pdf`,
        uuidSafe: req.leadId,
      },
      {},
    );

    if (!ok) throw new Error(`D4Sign: status não-ok`);
    const uuid = data?.uuid ?? '';
    const contractUrl = `https://secure.d4sign.com.br/embed/viewblob/${uuid}`;
    return { status: 'sent', provider: 'd4sign', contractUrl, externalKey: uuid };
  } catch (err) {
    infraLogger.warn({ err: (err as Error).message, leadId: req.leadId }, 'D4Sign falhou — pending_signature');
    return { status: 'failed', provider: 'd4sign', message: (err as Error).message };
  }
}

/** Gera um PDF mínimo em base64 com os termos do contrato.
 *  Em produção deve usar um template real (ex.: jsPDF ou geração server-side). */
function buildContractBase64(req: ContractRequest): string {
  const priceBrl = (req.planPriceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const text = [
    `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE INTERNET`,
    `Contratante: ${req.signerName} — CPF: ${req.signerCpf}`,
    `Endereço de instalação: ${req.address}`,
    `Plano contratado: ${req.planName} — ${priceBrl}/mês`,
    `Data: ${new Date().toLocaleDateString('pt-BR')}`,
  ].join('\n');

  // Base64 de um PDF placeholder (bytes do header PDF mínimo + texto UTF-8).
  return Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n2 0 obj<</Type/Page>>endobj\n%%EOF\n${text}`).toString('base64');
}
