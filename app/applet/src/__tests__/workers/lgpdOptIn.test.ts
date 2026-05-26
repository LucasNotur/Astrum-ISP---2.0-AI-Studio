import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendWhatsAppMessage = vi.fn();
const mockSaveToFirestore = vi.fn();

let mockCustomers: Record<string, any> = {};
let mockTickets: Record<string, any> = {};
const CURRENT_OPT_IN_VERSION = 'v2.0';

async function forgetMe(customerId: string) {
  if (mockCustomers[customerId]) {
    delete mockCustomers[customerId].name;
    delete mockCustomers[customerId].phone;
    delete mockCustomers[customerId].cpf;
    delete mockCustomers[customerId].opt_in_at;
    delete mockCustomers[customerId].opt_in_version;
    await mockSaveToFirestore('customers', mockCustomers[customerId]);
  }
}

async function handleIncomingMessage(phone: string, text: string, customerId: string, ticketId: string) {
  let customer = mockCustomers[customerId] || { id: customerId, phone };
  mockCustomers[customerId] = customer;
  
  let ticket = mockTickets[ticketId] || { id: ticketId, customerId, status: 'open' };
  mockTickets[ticketId] = ticket;

  if (customer.opt_in_version !== CURRENT_OPT_IN_VERSION) {
    if (ticket.waitingForOptIn) {
      // Process response
      const response = text.trim().toUpperCase();
      if (response === 'SIM') {
        customer.opt_in_at = new Date().toISOString();
        customer.opt_in_version = CURRENT_OPT_IN_VERSION;
        ticket.waitingForOptIn = false;
        await mockSaveToFirestore('customers', customer);
        await mockSendWhatsAppMessage(phone, 'Consentimento registrado. Como posso ajudar?');
        return { status: 'opt_in_granted' };
      } else if (response === 'NÃO' || response === 'NAO') {
        ticket.status = 'closed';
        ticket.waitingForOptIn = false;
        await mockSaveToFirestore('tickets', ticket);
        await mockSendWhatsAppMessage(phone, 'Atendimento encerrado pois o consentimento é necessário.');
        return { status: 'opt_in_denied' };
      } else {
        await mockSendWhatsAppMessage(phone, 'Resposta inválida. Por favor, responda com SIM ou NÃO.');
        return { status: 'invalid_response' };
      }
    } else {
      // Request opt in BEFORE processing data
      ticket.waitingForOptIn = true;
      await mockSaveToFirestore('tickets', ticket);
      await mockSendWhatsAppMessage(phone, `Para continuarmos, precisamos do seu consentimento com nossa política de privacidade (${CURRENT_OPT_IN_VERSION}). Responda SIM ou NÃO.`);
      return { status: 'consent_requested' };
    }
  }

  // Already opted in, process normally
  return { status: 'message_processed' };
}

describe('Testes do Opt-in LGPD', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomers = {};
    mockTickets = {};
  });

  it('1. Primeiro contato → consentimento enviado ANTES de processar qualquer dado pessoal', async () => {
    const result = await handleIncomingMessage('5511999999999', 'Oi', 'c1', 't1');
    
    expect(result.status).toBe('consent_requested');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith('5511999999999', expect.stringContaining('SIM ou NÃO'));
    expect(mockCustomers['c1'].opt_in_at).toBeUndefined();
  });

  it('2. Resposta SIM → opt_in_at e opt_in_version salvos no customer', async () => {
    mockTickets['t2'] = { id: 't2', customerId: 'c2', waitingForOptIn: true };
    mockCustomers['c2'] = { id: 'c2', phone: '5511999999998' };
    
    const result = await handleIncomingMessage('5511999999998', 'SIM', 'c2', 't2');
    
    expect(result.status).toBe('opt_in_granted');
    expect(mockCustomers['c2'].opt_in_at).toBeDefined();
    expect(mockCustomers['c2'].opt_in_version).toBe(CURRENT_OPT_IN_VERSION);
    expect(mockSaveToFirestore).toHaveBeenCalledWith('customers', mockCustomers['c2']);
  });

  it('3. Resposta NÃO → ticket encerrado sem salvar dados pessoais', async () => {
    mockTickets['t3'] = { id: 't3', customerId: 'c3', waitingForOptIn: true, status: 'open' };
    mockCustomers['c3'] = { id: 'c3', phone: '5511999999997' };
    
    const result = await handleIncomingMessage('5511999999997', 'NÃO', 'c3', 't3');
    
    expect(result.status).toBe('opt_in_denied');
    expect(mockTickets['t3'].status).toBe('closed');
    expect(mockCustomers['c3'].opt_in_at).toBeUndefined();
  });

  it('4. Resposta inválida → solicita novamente claramente', async () => {
    mockTickets['t4'] = { id: 't4', customerId: 'c4', waitingForOptIn: true };
    mockCustomers['c4'] = { id: 'c4', phone: '5511999999996' };
    
    const result = await handleIncomingMessage('5511999999996', 'TALVEZ', 'c4', 't4');
    
    expect(result.status).toBe('invalid_response');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith('5511999999996', expect.stringContaining('Resposta inválida'));
  });

  it('5. Opt-in já registrado → não reenvia mensagem de consentimento', async () => {
    mockCustomers['c5'] = { id: 'c5', phone: '5511999999995', opt_in_version: CURRENT_OPT_IN_VERSION, opt_in_at: '2023-01-01T00:00:00.000Z' };
    
    const result = await handleIncomingMessage('5511999999995', 'Gostaria de comprar', 'c5', 't5');
    
    expect(result.status).toBe('message_processed');
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('6. opt_in_version diferente do atual → solicita novo consentimento', async () => {
    // Has opt in, but old version
    mockCustomers['c6'] = { id: 'c6', phone: '5511999999994', opt_in_version: 'v1.0', opt_in_at: '2022-01-01T00:00:00.000Z' };
    
    const result = await handleIncomingMessage('5511999999994', 'Oi', 'c6', 't6');
    
    expect(result.status).toBe('consent_requested');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith('5511999999994', expect.stringContaining(CURRENT_OPT_IN_VERSION));
  });

  it('7. Forget-me executado → opt_in_at e opt_in_version também apagados', async () => {
    mockCustomers['c7'] = { id: 'c7', name: 'João', opt_in_version: CURRENT_OPT_IN_VERSION, opt_in_at: '2023-01-01' };
    
    await forgetMe('c7');
    
    expect(mockCustomers['c7'].name).toBeUndefined();
    expect(mockCustomers['c7'].opt_in_at).toBeUndefined();
    expect(mockCustomers['c7'].opt_in_version).toBeUndefined();
    expect(mockSaveToFirestore).toHaveBeenCalledWith('customers', mockCustomers['c7']);
  });

});
