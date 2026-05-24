import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnlockService, ERPUnlockAdapter, PaymentService, TicketService, WhatsAppService } from '../../../lib/integrations/unlock';

describe('Unlock & Second Copy Tests', () => {
  let adapter: import('vitest').Mocked<ERPUnlockAdapter>;
  let paymentService: import('vitest').Mocked<PaymentService>;
  let ticketService: import('vitest').Mocked<TicketService>;
  let whatsappService: import('vitest').Mocked<WhatsAppService>;
  let unlockService: UnlockService;

  beforeEach(() => {
    adapter = {
      unlockCustomer: vi.fn(),
      generateSecondCopy: vi.fn(),
    };
    paymentService = {
      isPaymentConfirmed: vi.fn(),
    };
    ticketService = {
      createUrgentTicket: vi.fn(),
      closeTicket: vi.fn(),
    };
    whatsappService = {
      sendMessage: vi.fn(),
    };

    unlockService = new UnlockService(adapter, paymentService, ticketService, whatsappService);
    
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('1. unlockCustomer com pagamento confirmado -> chama adapter.unlockCustomer() com sucesso', async () => {
    paymentService.isPaymentConfirmed.mockResolvedValue(true);
    adapter.unlockCustomer.mockResolvedValue();

    await unlockService.unlockCustomer('123', 'pay_1');

    expect(adapter.unlockCustomer).toHaveBeenCalledTimes(1);
    expect(adapter.unlockCustomer).toHaveBeenCalledWith('123');
  });

  it('2. unlockCustomer com pagamento NÃO confirmado -> NÃO chama adapter.unlockCustomer() em hipótese alguma', async () => {
    paymentService.isPaymentConfirmed.mockResolvedValue(false);

    await unlockService.unlockCustomer('123', 'pay_2');

    expect(adapter.unlockCustomer).not.toHaveBeenCalled();
  });

  it('3. unlockCustomer com falha na 1ª tentativa -> tenta novamente após 5s', async () => {
    paymentService.isPaymentConfirmed.mockResolvedValue(true);
    adapter.unlockCustomer
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockResolvedValueOnce();

    const promise = unlockService.unlockCustomer('123', 'pay_3');
    
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(adapter.unlockCustomer).toHaveBeenCalledTimes(2);
    expect(ticketService.createUrgentTicket).not.toHaveBeenCalled();
  });

  it('4. unlockCustomer com 2 falhas consecutivas -> cria ticket urgente para operador humano', async () => {
    paymentService.isPaymentConfirmed.mockResolvedValue(true);
    adapter.unlockCustomer
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'));

    const promise = unlockService.unlockCustomer('123', 'pay_4');
    
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(adapter.unlockCustomer).toHaveBeenCalledTimes(2);
    expect(ticketService.createUrgentTicket).toHaveBeenCalledTimes(1);
    expect(ticketService.createUrgentTicket).toHaveBeenCalledWith('123', expect.any(String));
  });

  it('5. generateSecondCopy -> retorna objeto com pix_copia_cola e boleto_url não nulos', async () => {
    adapter.generateSecondCopy.mockResolvedValue({
      pix_copia_cola: 'copy_paste_pix',
      boleto_url: 'http://boleto.url'
    });

    const result = await unlockService.generateSecondCopy('123');

    expect(result.pix_copia_cola).not.toBeNull();
    expect(result.boleto_url).not.toBeNull();
    expect(result).toEqual({
      pix_copia_cola: 'copy_paste_pix',
      boleto_url: 'http://boleto.url'
    });
  });

  it('6. Webhook payment-confirmed -> sequência obrigatória: verifica pagamento -> unlock -> WhatsApp -> fecha ticket', async () => {
    const callOrder: string[] = [];
    
    paymentService.isPaymentConfirmed.mockImplementation(async () => {
      callOrder.push('verify');
      return true;
    });
    adapter.unlockCustomer.mockImplementation(async () => {
      callOrder.push('unlock');
    });
    whatsappService.sendMessage.mockImplementation(async () => {
      callOrder.push('whatsapp');
    });
    ticketService.closeTicket.mockImplementation(async () => {
      callOrder.push('close_ticket');
    });

    await unlockService.handlePaymentConfirmedWebhook('wh_1', '123', 'pay_1', 'cust_1');

    expect(callOrder).toEqual(['verify', 'unlock', 'whatsapp', 'close_ticket']);
  });

  it('7. Mesmo webhook de pagamento processado duas vezes -> desbloqueio executado apenas 1 vez (idempotência)', async () => {
    paymentService.isPaymentConfirmed.mockResolvedValue(true);
    adapter.unlockCustomer.mockResolvedValue();
    whatsappService.sendMessage.mockResolvedValue();
    ticketService.closeTicket.mockResolvedValue();

    await unlockService.handlePaymentConfirmedWebhook('wh_2', '123', 'pay_2', 'cust_2');
    await unlockService.handlePaymentConfirmedWebhook('wh_2', '123', 'pay_2', 'cust_2');

    expect(paymentService.isPaymentConfirmed).toHaveBeenCalledTimes(1);
    expect(adapter.unlockCustomer).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendMessage).toHaveBeenCalledTimes(1);
    expect(ticketService.closeTicket).toHaveBeenCalledTimes(1);
  });
});
