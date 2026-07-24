import { describe, it, expect, vi } from 'vitest';
import { processIncomingEmail, IncomingEmail, EmailToTicketPorts } from './email-to-ticket.service';

function makeEmail(overrides: Partial<IncomingEmail> = {}): IncomingEmail {
  return {
    from: 'cliente@gmail.com',
    to: 'suporte@isp-exemplo.com.br',
    subject: 'Internet lenta',
    body: 'Minha internet está muito lenta há 2 dias.',
    receivedAt: '2026-07-22T10:00:00Z',
    messageId: 'msg-123',
    ...overrides,
  };
}

function makePorts(): EmailToTicketPorts {
  return {
    resolveTenantByDomain: vi.fn().mockResolvedValue('tenant-abc'),
    findCustomerByEmail: vi.fn().mockResolvedValue('customer-123'),
    findTicketByEmailThread: vi.fn().mockResolvedValue(null),
    createTicket: vi.fn().mockResolvedValue('ticket-456'),
    addMessageToTicket: vi.fn().mockResolvedValue(undefined),
  };
}

describe('email-to-ticket.service', () => {
  it('cria ticket novo a partir de email', async () => {
    const ports = makePorts();
    const result = await processIncomingEmail(makeEmail(), ports);
    expect(result.action).toBe('created');
    expect(result.ticketId).toBe('ticket-456');
    expect(ports.createTicket).toHaveBeenCalledWith('tenant-abc', expect.objectContaining({
      subject: 'Internet lenta',
      channel: 'email',
      customerId: 'customer-123',
    }));
  });

  it('rejeita domínio desconhecido', async () => {
    const ports = makePorts();
    (ports.resolveTenantByDomain as any).mockResolvedValue(null);
    const result = await processIncomingEmail(makeEmail(), ports);
    expect(result.action).toBe('rejected');
    expect(result.reason).toContain('não vinculado');
  });

  it('rejeita prefixo que não é alias de suporte', async () => {
    const ports = makePorts();
    const result = await processIncomingEmail(makeEmail({ to: 'vendas@isp-exemplo.com.br' }), ports);
    expect(result.action).toBe('rejected');
    expect(result.reason).toContain('vendas');
  });

  it('adiciona mensagem a ticket existente em reply', async () => {
    const ports = makePorts();
    (ports.findTicketByEmailThread as any).mockResolvedValue('ticket-existing');
    const result = await processIncomingEmail(makeEmail({ inReplyTo: 'msg-original' }), ports);
    expect(result.action).toBe('appended');
    expect(result.ticketId).toBe('ticket-existing');
    expect(ports.addMessageToTicket).toHaveBeenCalledOnce();
  });

  it('cria ticket novo se reply não encontra thread', async () => {
    const ports = makePorts();
    const result = await processIncomingEmail(makeEmail({ inReplyTo: 'msg-unknown' }), ports);
    expect(result.action).toBe('created');
  });

  it('cria ticket sem customerId quando email não cadastrado', async () => {
    const ports = makePorts();
    (ports.findCustomerByEmail as any).mockResolvedValue(null);
    const result = await processIncomingEmail(makeEmail(), ports);
    expect(result.action).toBe('created');
    expect(ports.createTicket).toHaveBeenCalledWith('tenant-abc', expect.objectContaining({
      customerId: undefined,
    }));
  });

  it('aceita alias "atendimento"', async () => {
    const ports = makePorts();
    const result = await processIncomingEmail(makeEmail({ to: 'atendimento@isp-exemplo.com.br' }), ports);
    expect(result.action).toBe('created');
  });

  it('usa "(Sem assunto)" quando subject vazio', async () => {
    const ports = makePorts();
    await processIncomingEmail(makeEmail({ subject: '' }), ports);
    expect(ports.createTicket).toHaveBeenCalledWith('tenant-abc', expect.objectContaining({
      subject: '(Sem assunto)',
    }));
  });
});
