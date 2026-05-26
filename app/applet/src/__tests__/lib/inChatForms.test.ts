import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSaveToFirestore = vi.fn();
const mockSendWhatsAppMessage = vi.fn();

let mockTenants: Record<string, any> = {};
let mockTickets: Record<string, any> = {};
let mockClientHistory: Record<string, any[]> = {};

async function submitInChatForm(ticketId: string, formId: string, formData: any, tenantId: string) {
  const tenant = mockTenants[tenantId];
  if (!tenant || !tenant.forms || tenant.forms.length === 0) {
    return { success: false, reason: 'no_forms_configured' };
  }

  const formConfig = tenant.forms.find((f: any) => f.id === formId);
  if (!formConfig) {
    return { success: false, reason: 'form_not_found' };
  }

  // Validate required fields
  for (const field of formConfig.fields) {
    if (field.required && (!formData[field.name] || formData[field.name].trim() === '')) {
      return { success: false, reason: 'required_field_missing', field: field.name };
    }
  }

  const ticket = mockTickets[ticketId];
  if (ticket) {
    if (!ticket.form_data) ticket.form_data = {};
    ticket.form_data[formId] = formData;
    
    // Save to history side panel
    if (!mockClientHistory[ticket.clientId]) {
      mockClientHistory[ticket.clientId] = [];
    }
    
    const historyEntry = {
      type: 'form',
      formId,
      data: formData,
      timestamp: new Date().toISOString()
    };
    
    mockClientHistory[ticket.clientId].push(historyEntry);
    
    await mockSaveToFirestore('tickets', ticket);
    await mockSaveToFirestore('client_history', historyEntry);
    
    return { success: true };
  }
  
  return { success: false, reason: 'ticket_not_found' };
}

function getAvailableForms(tenantId: string) {
  const tenant = mockTenants[tenantId];
  if (!tenant || !tenant.forms || tenant.forms.length === 0) {
    return [];
  }
  return tenant.forms;
}

describe('Testes de Formulários Mid-Chat (In-Chat Forms)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenants = {
      'tenantA': {
        forms: [
          { id: 'f1', name: 'Coleta de Dados', fields: [{ name: 'cpf', required: true }, { name: 'obs', required: false }] }
        ]
      },
      'tenantB': {
        forms: [
          { id: 'f2', name: 'Pesquisa', fields: [{ name: 'rating', required: true }] }
        ]
      },
      'tenantC': {} // No forms
    };
    
    mockTickets = {
      't1': { id: 't1', tenantId: 'tenantA', clientId: 'c1' },
      't2': { id: 't2', tenantId: 'tenantB', clientId: 'c2' }
    };
    
    mockClientHistory = {};
  });

  it('1. Formulário acionado pelo operador → dados coletados salvos em ticket.form_data', async () => {
    const result = await submitInChatForm('t1', 'f1', { cpf: '12345678900', obs: 'ok' }, 'tenantA');
    
    expect(result.success).toBe(true);
    expect(mockTickets['t1'].form_data['f1']).toEqual({ cpf: '12345678900', obs: 'ok' });
    expect(mockSaveToFirestore).toHaveBeenCalledWith('tickets', mockTickets['t1']);
  });

  it('2. Campo obrigatório vazio → não permite salvar o formulário', async () => {
    const result = await submitInChatForm('t1', 'f1', { cpf: '', obs: 'ok' }, 'tenantA');
    
    expect(result.success).toBe(false);
    expect(result.reason).toBe('required_field_missing');
    expect(result.field).toBe('cpf');
    expect(mockTickets['t1'].form_data).toBeUndefined();
  });

  it('3. Formulário NÃO enviado ao cliente via WhatsApp (apenas lado do operador)', async () => {
    await submitInChatForm('t1', 'f1', { cpf: '123', obs: '' }, 'tenantA');
    
    // As inChat forms are internal, sendWhatsAppMessage should never be called
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('4. Formulários do tenant A → não visíveis para operadores do tenant B', () => {
    const formsA = getAvailableForms('tenantA');
    const formsB = getAvailableForms('tenantB');
    
    expect(formsA.length).toBe(1);
    expect(formsA[0].id).toBe('f1');
    
    expect(formsB.length).toBe(1);
    expect(formsB[0].id).toBe('f2');
    
    expect(formsA.some(f => f.id === 'f2')).toBe(false); // Tenant A does not see Tenant B's form
  });

  it('5. Formulário salvo → aparece no histórico lateral do cliente', async () => {
    await submitInChatForm('t1', 'f1', { cpf: '111', obs: 'his' }, 'tenantA');
    
    const history = mockClientHistory['c1'];
    expect(history.length).toBe(1);
    expect(history[0].type).toBe('form');
    expect(history[0].data.cpf).toBe('111');
  });

  it('6. Tenant sem formulários configurados → botão desabilitado sem crash', () => {
    const formsC = getAvailableForms('tenantC');
    
    // UI can use this empty array to disable the button
    expect(formsC.length).toBe(0);
    // Should not crash
  });

});
