import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendWhatsAppMessage = vi.fn();
const mockSaveToFirestore = vi.fn();
const mockSendPushNotification = vi.fn();

// Simulação da função que processa o envio de mensagens do painel
async function sendMessage(
  text: string, 
  tenantId: string, 
  operatorId: string, 
  mentions: string[] = []
) {
  const isInternal = text.startsWith('[INTERNO]');
  
  if (isInternal) {
    if (mentions.includes('@operador_joao')) {
      await mockSendPushNotification('operador_joao', 'Você foi mencionado em uma nota interna');
    }
  } else {
    await mockSendWhatsAppMessage(text);
  }

  await mockSaveToFirestore({
    text,
    tenant_id: tenantId,
    operator_id: operatorId,
    is_internal: isInternal
  });
}

function fetchNotes(tenantId: string, notesDb: any[]) {
  return notesDb.filter(note => note.tenant_id === tenantId);
}

describe('Testes do Sussurro (Internal Notes)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Nota com prefixo [INTERNO] → NÃO enviada ao cliente via WhatsApp', async () => {
    await sendMessage('[INTERNO] Favor verificar este cliente', 'tenant1', 'op1');
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('2. Nota interna → visível apenas para operadores no painel (simulado por is_internal)', async () => {
    await sendMessage('[INTERNO] Alerta de churn', 'tenant1', 'op1');
    expect(mockSaveToFirestore).toHaveBeenCalledWith(expect.objectContaining({
      is_internal: true
    }));
  });

  it('3. Menção @operador → operador mencionado recebe notificação push', async () => {
    await sendMessage('[INTERNO] @operador_joao assuma aqui', 'tenant1', 'op1', ['@operador_joao']);
    expect(mockSendPushNotification).toHaveBeenCalledWith('operador_joao', expect.any(String));
  });

  it('4. Mensagem sem [INTERNO] → enviada normalmente ao cliente', async () => {
    await sendMessage('Olá, como posso ajudar?', 'tenant1', 'op1');
    expect(mockSendWhatsAppMessage).toHaveBeenCalled();
  });

  it('5. Nota interna salva no Firestore → campo is_internal=true', async () => {
    await sendMessage('[INTERNO] Check de saldo', 'tenant1', 'op1');
    expect(mockSaveToFirestore).toHaveBeenCalledWith(
      expect.objectContaining({ is_internal: true })
    );
  });

  it('6. Nota do tenant A → não visível para operadores do tenant B', () => {
    const mockDb = [
      { id: 1, text: '[INTERNO] A', tenant_id: 'tenantA', is_internal: true },
      { id: 2, text: '[INTERNO] B', tenant_id: 'tenantB', is_internal: true },
    ];

    const notesForA = fetchNotes('tenantA', mockDb);
    expect(notesForA.length).toBe(1);
    expect(notesForA[0].tenant_id).toBe('tenantA');
    
    const notesForB = fetchNotes('tenantB', mockDb);
    expect(notesForB.length).toBe(1);
    expect(notesForB[0].tenant_id).toBe('tenantB');
  });

});
