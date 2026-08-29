/**
 * P3-03 — Contrato digital.
 *
 * Envia o contrato para assinatura via Clicksign ou D4Sign.
 * SaaS multi-tenant: prioriza a chave que o próprio ISP configurar em
 * Configurações → Integrações (`resolveTenantContractKeys`); sem chave própria,
 * cai para CLICKSIGN_API_KEY/D4SIGN_API_KEY (env global da Astrum).
 * Fail-open: sem nenhuma das duas, configura `contract_status = 'pending_signature'`
 * e retorna sem erro — o operador acompanha pelo painel do provedor de assinatura.
 *
 * ─── Fase A (offline) concluída ────────────────────────────────────────────────
 * O PDF do contrato agora é gerado de verdade (jsPDF — PDF válido com xref/trailer,
 * não mais o placeholder inválido) e as sequências de chamadas dos dois provedores
 * estão completas (Clicksign: /documents → /signers → /lists; D4Sign: upload →
 * createlist → sendtosigner).
 *
 * ⚠️ Os SHAPES exatos de request/response dos provedores são PROVÁVEIS, montados a
 * partir da doc pública — ainda NÃO validados ao vivo (Fase B, precisa credencial
 * de sandbox). A leitura das respostas é defensiva (optional chaining + fallback)
 * pra não quebrar quando o campo real diferir. Ver
 * .astrum-progress/PLANO_P3_03_CONTRATO_DIGITAL.md.
 */
import { jsPDF } from 'jspdf';
import { infraLogger } from '../../infrastructure/logging/logger';
import { resolveTenantContractKeys } from '../../lib/tenant-keys';

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
  const tenantKeys = await resolveTenantContractKeys(req.tenantId);
  const clicksignKey = tenantKeys.clicksignApiKey;
  const d4signKey = tenantKeys.d4signApiKey;

  if (clicksignKey) return sendViaClicksign(req, clicksignKey, http);
  if (d4signKey) return sendViaD4sign(req, d4signKey, http);

  // Nenhuma chave configurada — retorna pending sem erro.
  infraLogger.info(
    { leadId: req.leadId, tenantId: req.tenantId },
    'Contrato: nenhuma chave de assinatura digital configurada — status pending_signature',
  );
  return { status: 'pending_signature', provider: 'none', message: 'Configurar CLICKSIGN_API_KEY ou D4SIGN_API_KEY' };
}

/**
 * Clicksign (API v1). Três passos — a v1 NÃO aceita signatário inline no create do
 * documento (o stub antigo mandava assim e nunca ia pra assinatura):
 *   1. POST /documents  → cria o documento a partir do PDF base64 (devolve key)
 *   2. POST /signers    → cria/idempotência do signatário (devolve key)
 *   3. POST /lists      → vincula documento+signatário e dispara a notificação
 *                         (devolve request_signature_key, base da URL de assinatura)
 */
async function sendViaClicksign(
  req: ContractRequest,
  apiKey: string,
  http: ContractHttpClient,
): Promise<ContractResult> {
  const base = 'https://app.clicksign.com/api/v1';
  const q = `access_token=${encodeURIComponent(apiKey)}`;
  try {
    // 1. Documento
    const doc = await http.post(
      `${base}/documents?${q}`,
      {
        document: {
          path: `/contratos/${req.tenantId}/${req.leadId}.pdf`,
          content_base64: `data:application/pdf;base64,${buildContractBase64(req)}`,
          deadline_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          auto_close: true,
          sequence_enabled: false,
        },
      },
      {},
    );
    if (!doc.ok) throw new Error('Clicksign: criação do documento não-ok');
    const documentKey = doc.data?.document?.key ?? '';
    if (!documentKey) throw new Error('Clicksign: resposta sem document.key');

    // 2. Signatário
    const signer = await http.post(
      `${base}/signers?${q}`,
      {
        signer: {
          email: req.signerEmail ?? '',
          name: req.signerName,
          phone_number: req.signerPhone?.replace(/\D/g, '') ?? '',
          documentation: req.signerCpf.replace(/\D/g, ''),
          has_documentation: true,
          auths: ['email'],
          delivery: 'email',
        },
      },
      {},
    );
    if (!signer.ok) throw new Error('Clicksign: criação do signatário não-ok');
    const signerKey = signer.data?.signer?.key ?? '';
    if (!signerKey) throw new Error('Clicksign: resposta sem signer.key');

    // 3. Lista (vincula + dispara)
    const list = await http.post(
      `${base}/lists?${q}`,
      {
        list: {
          document_key: documentKey,
          signer_key: signerKey,
          sign_as: 'sign',
          message: `Contrato de instalação — ${req.planName}. Assine para confirmar.`,
        },
      },
      {},
    );
    if (!list.ok) throw new Error('Clicksign: criação da lista não-ok');

    // A URL de assinatura vem do request_signature_key da lista; se o shape real
    // diferir, cai num fallback baseado na key do documento (ainda navegável).
    const requestSignatureKey = list.data?.list?.request_signature_key ?? '';
    const contractUrl = requestSignatureKey
      ? `https://app.clicksign.com/sign/${requestSignatureKey}`
      : `https://app.clicksign.com/documents/${documentKey}`;

    return { status: 'sent', provider: 'clicksign', contractUrl, externalKey: documentKey };
  } catch (err) {
    infraLogger.warn({ err: (err as Error).message, leadId: req.leadId }, 'Clicksign falhou — contrato não enviado');
    return { status: 'failed', provider: 'clicksign', message: (err as Error).message };
  }
}

/**
 * D4Sign (API v1). Três passos — o stub antigo só fazia o upload e devolvia `sent`,
 * mas o documento nunca ia pra assinatura sem registrar o signatário e disparar:
 *   1. POST /documents/upload           → sobe o PDF (devolve uuid)
 *   2. POST /documents/{uuid}/createlist → registra o signatário
 *   3. POST /documents/{uuid}/sendtosigner → dispara o e-mail de assinatura
 * Obs.: contas D4Sign costumam exigir também `cryptKey` do cofre em alguns
 * endpoints — adicionar quando validar ao vivo (Fase B) se a conta do tenant pedir.
 */
async function sendViaD4sign(
  req: ContractRequest,
  apiKey: string,
  http: ContractHttpClient,
): Promise<ContractResult> {
  const base = 'https://secure.d4sign.com.br/api/v1';
  const q = `tokenAPI=${encodeURIComponent(apiKey)}`;
  try {
    // 1. Upload
    const upload = await http.post(
      `${base}/documents/upload?${q}`,
      {
        base64_binary_file: buildContractBase64(req),
        mime_type: 'application/pdf',
        name: `Contrato_${req.leadId}.pdf`,
        uuidSafe: req.leadId,
      },
      {},
    );
    if (!upload.ok) throw new Error('D4Sign: upload não-ok');
    const uuid = upload.data?.uuid ?? '';
    if (!uuid) throw new Error('D4Sign: resposta sem uuid');

    // 2. Registrar signatário
    const createList = await http.post(
      `${base}/documents/${uuid}/createlist?${q}`,
      {
        signers: [
          {
            email: req.signerEmail ?? '',
            act: '1',                 // 1 = assinar
            foreign: '0',
            certificadoicpbr: '0',
            assinatura_presencial: '0',
            docauthandselfie: '0',
          },
        ],
      },
      {},
    );
    if (!createList.ok) throw new Error('D4Sign: createlist não-ok');

    // 3. Disparar o envio pra assinatura
    const send = await http.post(
      `${base}/documents/${uuid}/sendtosigner?${q}`,
      {
        message: `Contrato de instalação — ${req.planName}. Assine para confirmar.`,
        workflow: '0',
        skip_email: '0',
      },
      {},
    );
    if (!send.ok) throw new Error('D4Sign: sendtosigner não-ok');

    const contractUrl = `https://secure.d4sign.com.br/embed/viewblob/${uuid}`;
    return { status: 'sent', provider: 'd4sign', contractUrl, externalKey: uuid };
  } catch (err) {
    infraLogger.warn({ err: (err as Error).message, leadId: req.leadId }, 'D4Sign falhou — contrato não enviado');
    return { status: 'failed', provider: 'd4sign', message: (err as Error).message };
  }
}

// ── Geração do PDF ─────────────────────────────────────────────────────────────

/** Cláusulas mínimas de um contrato de prestação de serviço de internet.
 *  Template default da Astrum; por-tenant fica pra fase posterior (ver plano). */
const CONTRACT_CLAUSES: string[] = [
  'CLÁUSULA 1 — OBJETO. O presente contrato tem por objeto a prestação, pela CONTRATADA, de serviço de conexão à internet (SCM) no endereço de instalação indicado, conforme o plano contratado.',
  'CLÁUSULA 2 — PLANO E PREÇO. O CONTRATANTE contrata o plano indicado acima, pelo valor mensal correspondente, com vencimento mensal a partir da ativação do serviço.',
  'CLÁUSULA 3 — INSTALAÇÃO. A ativação depende de viabilidade técnica no endereço e da instalação dos equipamentos pela CONTRATADA, em data agendada entre as partes.',
  'CLÁUSULA 4 — VIGÊNCIA. Este contrato vigora por prazo indeterminado a partir da assinatura, podendo ser rescindido por qualquer das partes mediante aviso prévio, observadas as condições comerciais vigentes.',
  'CLÁUSULA 5 — EQUIPAMENTOS. Os equipamentos fornecidos em regime de comodato permanecem de propriedade da CONTRATADA e devem ser devolvidos em caso de rescisão.',
  'CLÁUSULA 6 — LGPD. Os dados pessoais do CONTRATANTE são tratados exclusivamente para a execução deste contrato, nos termos da Lei nº 13.709/2018 (LGPD).',
  'CLÁUSULA 7 — ACEITE. A assinatura eletrônica deste documento representa o aceite integral das condições aqui previstas e das condições comerciais do plano contratado.',
];

/**
 * Gera o PDF do contrato em base64 (sem o prefixo data:). Usa jsPDF — produz um PDF
 * VÁLIDO (header %PDF, objetos, xref, trailer, %%EOF), diferente do placeholder
 * anterior que os provedores rejeitavam. Função pura (sem I/O) — testável offline.
 */
export function buildContractBase64(req: ContractRequest): string {
  const priceBrl = (req.planPriceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const marginX = 48;
  const maxWidth = 595 - marginX * 2; // A4 = 595pt de largura
  let y = 64;

  const writeLine = (text: string, size: number, opts: { bold?: boolean; gap?: number } = {}) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      if (y > 800) { doc.addPage(); y = 64; }
      doc.text(line, marginX, y);
      y += size + 4;
    }
    y += opts.gap ?? 0;
  };

  writeLine('CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE INTERNET', 14, { bold: true, gap: 12 });
  writeLine(`Contratante: ${req.signerName} — CPF: ${req.signerCpf}`, 11);
  writeLine(`Endereço de instalação: ${req.address}`, 11);
  writeLine(`Plano contratado: ${req.planName} — ${priceBrl}/mês`, 11);
  writeLine(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 11, { gap: 16 });

  for (const clause of CONTRACT_CLAUSES) {
    writeLine(clause, 10, { gap: 8 });
  }

  writeLine('_________________________________________', 11, { gap: 2 });
  writeLine(`${req.signerName} (assinatura eletrônica)`, 10);

  // jsPDF: arraybuffer → Buffer → base64. Roda no Node (validado no projeto).
  const buffer = Buffer.from(doc.output('arraybuffer') as ArrayBuffer);
  return buffer.toString('base64');
}
