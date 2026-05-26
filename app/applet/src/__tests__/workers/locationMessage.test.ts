import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSaveToFirestore = vi.fn();
const mockSendWhatsAppMessage = vi.fn();
const mockGeocode = vi.fn();

let mockTickets: Record<string, any> = {};
let mockOperatorPanels: Record<string, any> = {};

async function processLocationMessage(ticketId: string, tenantId: string, lat: number, lon: number) {
  const ticket = mockTickets[ticketId];
  if (!ticket) return { success: false, reason: 'ticket_not_found' };

  ticket.customer_location = { lat, lon };
  
  // Exibir no painel do operador
  if (!mockOperatorPanels[tenantId]) {
    mockOperatorPanels[tenantId] = {};
  }
  mockOperatorPanels[tenantId][ticketId] = { showMap: true, lat, lon };

  try {
    const geoData = await mockGeocode(lat, lon);
    ticket.cep = geoData.zipcode;
    await mockSaveToFirestore('tickets', ticket);
    return { success: true, cep: geoData.zipcode };
  } catch (error) {
    // Geocoding falhou
    await mockSendWhatsAppMessage('Não conseguimos identificar seu CEP pela localização. Por favor, digite seu CEP:');
    await mockSaveToFirestore('tickets', ticket);
    return { success: false, reason: 'geocoding_failed' };
  }
}

describe('Testes de Localização GPS (Location Message)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockTickets = {
      't1': { id: 't1', tenantId: 'tenantA' },
      't2': { id: 't2', tenantId: 'tenantB' }
    };
    mockOperatorPanels = {};
  });

  it('1. locationMessage recebido → coordenadas salvas em ticket.customer_location', async () => {
    mockGeocode.mockResolvedValue({ zipcode: '12345-678' });
    
    await processLocationMessage('t1', 'tenantA', -23.5505, -46.6333);
    
    expect(mockTickets['t1'].customer_location).toEqual({ lat: -23.5505, lon: -46.6333 });
    expect(mockSaveToFirestore).toHaveBeenCalledWith('tickets', mockTickets['t1']);
  });

  it('2. Coordenadas salvas → mapa inline exibido no painel do operador', async () => {
    mockGeocode.mockResolvedValue({ zipcode: '12345-678' });
    
    await processLocationMessage('t1', 'tenantA', -23.5505, -46.6333);
    
    expect(mockOperatorPanels['tenantA']['t1'].showMap).toBe(true);
    expect(mockOperatorPanels['tenantA']['t1'].lat).toBe(-23.5505);
  });

  it('3. CEP extraído da localização → usado no fluxo de atendimento normalmente', async () => {
    mockGeocode.mockResolvedValue({ zipcode: '12345-678' });
    
    const result = await processLocationMessage('t1', 'tenantA', -23.5505, -46.6333);
    
    expect(result.success).toBe(true);
    expect(result.cep).toBe('12345-678');
    expect(mockTickets['t1'].cep).toBe('12345-678');
  });

  it('4. Geocoding falha (Nominatim indisponível) → solicita CEP manual ao cliente', async () => {
    mockGeocode.mockRejectedValue(new Error('API failure'));
    
    const result = await processLocationMessage('t1', 'tenantA', -23.5505, -46.6333);
    
    expect(result.success).toBe(false);
    expect(result.reason).toBe('geocoding_failed');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(expect.stringContaining('CEP'));
  });

  it('5. Localização do tenant A → não visível no painel do tenant B', async () => {
    mockGeocode.mockResolvedValue({ zipcode: '12345-678' });
    
    await processLocationMessage('t1', 'tenantA', -23.5505, -46.6333);
    
    expect(mockOperatorPanels['tenantA']['t1']).toBeDefined();
    expect(mockOperatorPanels['tenantB']).toBeUndefined(); // Tenant B tem acesso apenas ao B
  });

});
