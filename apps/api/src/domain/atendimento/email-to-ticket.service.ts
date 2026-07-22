/**
 * Dossiê #57 — Email to Ticket.
 * Converte emails recebidos em tickets do sistema de atendimento.
 * Detecta tenant pelo domínio do destinatário, cria ticket com
 * assunto/corpo do email, e associa ao cliente pelo remetente.
 */

export interface IncomingEmail {
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: string;
  attachments?: Array<{ name: string; contentType: string; size: number }>;
  messageId: string;
  inReplyTo?: string;
}

export interface EmailTicket {
  ticketId: string;
  tenantId: string;
  customerId?: string;
  subject: string;
  status: 'open';
  channel: 'email';
  createdAt: string;
}

export interface EmailToTicketPorts {
  resolveTenantByDomain: (domain: string) => Promise<string | null>;
  findCustomerByEmail: (tenantId: string, email: string) => Promise<string | null>;
  findTicketByEmailThread: (tenantId: string, messageId: string) => Promise<string | null>;
  createTicket: (tenantId: string, data: { subject: string; body: string; channel: 'email'; customerId?: string; metadata: Record<string, string> }) => Promise<string>;
  addMessageToTicket: (tenantId: string, ticketId: string, body: string, from: string) => Promise<void>;
}

function extractDomain(email: string): string {
  const atIdx = email.lastIndexOf('@');
  return atIdx >= 0 ? email.slice(atIdx + 1).toLowerCase() : '';
}

function extractSupportPrefix(to: string): string {
  const localPart = to.split('@')[0] ?? '';
  return localPart.toLowerCase();
}

export async function processIncomingEmail(
  email: IncomingEmail,
  ports: EmailToTicketPorts,
): Promise<{ action: 'created' | 'appended' | 'rejected'; ticketId?: string; reason?: string }> {
  const toDomain = extractDomain(email.to);
  const tenantId = await ports.resolveTenantByDomain(toDomain);

  if (!tenantId) {
    return { action: 'rejected', reason: `Domínio ${toDomain} não vinculado a nenhum tenant` };
  }

  const prefix = extractSupportPrefix(email.to);
  if (!['suporte', 'support', 'atendimento', 'help', 'contato'].includes(prefix)) {
    return { action: 'rejected', reason: `Prefixo "${prefix}" não é um alias de suporte` };
  }

  if (email.inReplyTo) {
    const existingTicket = await ports.findTicketByEmailThread(tenantId, email.inReplyTo);
    if (existingTicket) {
      await ports.addMessageToTicket(tenantId, existingTicket, email.body, email.from);
      return { action: 'appended', ticketId: existingTicket };
    }
  }

  const customerId = await ports.findCustomerByEmail(tenantId, email.from) ?? undefined;

  const ticketId = await ports.createTicket(tenantId, {
    subject: email.subject || '(Sem assunto)',
    body: email.body,
    channel: 'email',
    customerId,
    metadata: { emailFrom: email.from, emailMessageId: email.messageId },
  });

  return { action: 'created', ticketId };
}
