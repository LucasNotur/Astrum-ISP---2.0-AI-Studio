import { infraLogger } from '../../infrastructure/logging/logger';
import { resolveTenantSmtpConfig } from '../../lib/tenant-keys';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string;
  from?: string;
}

export interface EmailSendResult {
  messageId: string;
  status: 'sent' | 'failed';
}

/**
 * Envia e-mail via SMTP (nodemailer).
 *
 * SaaS multi-tenant: cada ISP configura o próprio SMTP em Configurações →
 * Integrações (`resolveTenantSmtpConfig`); sem `tenantId` ou sem config própria,
 * cai para SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM (env global da Astrum).
 * Quando nenhum dos dois está configurado, loga e retorna status 'failed' sem
 * jogar erro (fail-open: o canal de e-mail não derruba o worker).
 */
export async function sendEmail(message: EmailMessage, tenantId?: string): Promise<EmailSendResult> {
  const config = tenantId ? await resolveTenantSmtpConfig(tenantId) : globalSmtpConfig();
  if (!config) {
    infraLogger.warn({ to: message.to, tenantId }, 'SMTP não configurado — e-mail de saída ignorado');
    return { messageId: '', status: 'failed' };
  }

  // Import dinâmico para não quebrar quando nodemailer não está no bundle
  const nodemailer = await import('nodemailer');

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const from = message.from ?? config.from;

  const info = await transporter.sendMail({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.inReplyTo ? { inReplyTo: message.inReplyTo } : {}),
    ...(message.references ? { references: message.references } : {}),
  });

  infraLogger.info({ messageId: info.messageId, to: message.to }, 'E-mail enviado');
  return { messageId: info.messageId as string, status: 'sent' };
}

/** Fallback quando não há tenantId em contexto (ex.: job de sistema). */
function globalSmtpConfig(): { host: string; port: number; user: string; pass: string; from: string } | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'noreply@astrum.app',
  };
}
