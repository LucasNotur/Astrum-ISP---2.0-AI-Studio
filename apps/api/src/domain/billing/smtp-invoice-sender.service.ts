/**
 * Dossiê #48 — Disparo via SMTP de notas do SaaS.
 * Envia notas fiscais / faturas por e-mail usando SMTP configurável
 * por tenant, com template HTML, retry e rate limiting.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export interface InvoiceEmail {
  invoiceId: string;
  tenantId: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string;
  pdfUrl?: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  retriesUsed: number;
}

export interface SmtpPorts {
  getSmtpConfig: (tenantId: string) => Promise<SmtpConfig | null>;
  sendEmail: (config: SmtpConfig, to: string, subject: string, html: string, attachmentUrl?: string) => Promise<{ messageId: string }>;
  logSend: (tenantId: string, invoiceId: string, status: 'sent' | 'failed', messageId?: string, error?: string) => Promise<void>;
  countSentToday: (tenantId: string) => Promise<number>;
}

const DAILY_LIMIT = 500;
const MAX_RETRIES = 3;

export function buildInvoiceHtml(email: InvoiceEmail): string {
  const amountFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(email.amount);
  const [year, month, day] = email.dueDate.split('-');
  const dueDateFormatted = `${day}/${month}/${year}`;

  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
<h2 style="color:#1a73e8">Fatura ${email.invoiceNumber}</h2>
<p>Olá ${sanitizeHtml(email.recipientName)},</p>
<p>Segue sua fatura no valor de <strong>${amountFormatted}</strong> com vencimento em <strong>${dueDateFormatted}</strong>.</p>
${email.pdfUrl ? `<p><a href="${sanitizeHtml(email.pdfUrl)}" style="background:#1a73e8;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px">Baixar PDF</a></p>` : ''}
<hr style="border:none;border-top:1px solid #e0e0e0"/>
<p style="color:#666;font-size:12px">Este é um e-mail automático. Em caso de dúvidas, entre em contato com seu provedor.</p>
</div>`;
}

export function sanitizeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendInvoiceEmail(
  email: InvoiceEmail,
  ports: SmtpPorts,
): Promise<SendResult> {
  const config = await ports.getSmtpConfig(email.tenantId);
  if (!config) return { ok: false, error: 'SMTP não configurado para este tenant', retriesUsed: 0 };

  const sentToday = await ports.countSentToday(email.tenantId);
  if (sentToday >= DAILY_LIMIT) {
    return { ok: false, error: `Limite diário de ${DAILY_LIMIT} e-mails atingido`, retriesUsed: 0 };
  }

  const html = buildInvoiceHtml(email);
  let lastError = '';

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { messageId } = await ports.sendEmail(config, email.recipientEmail, email.subject, html, email.pdfUrl);
      await ports.logSend(email.tenantId, email.invoiceId, 'sent', messageId);
      return { ok: true, messageId, retriesUsed: attempt };
    } catch (err) {
      lastError = (err as Error).message;
    }
  }

  await ports.logSend(email.tenantId, email.invoiceId, 'failed', undefined, lastError);
  return { ok: false, error: lastError, retriesUsed: MAX_RETRIES };
}
