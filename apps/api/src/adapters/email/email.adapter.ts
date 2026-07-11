import { infraLogger } from '../../infrastructure/logging/logger';

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
 * Envia e-mail via SMTP (nodemailer). Requer SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS no env.
 * Quando SMTP não está configurado, loga e retorna status 'failed' sem jogar erro
 * (fail-open: o canal de e-mail não derruba o worker).
 */
export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    infraLogger.warn({ to: message.to }, 'SMTP não configurado — e-mail de saída ignorado');
    return { messageId: '', status: 'failed' };
  }

  // Import dinâmico para não quebrar quando nodemailer não está no bundle
  const nodemailer = await import('nodemailer');

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const from = message.from ?? process.env.SMTP_FROM ?? 'noreply@astrum.app';

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
