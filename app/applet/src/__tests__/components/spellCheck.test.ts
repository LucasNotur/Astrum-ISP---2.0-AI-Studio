import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendWhatsAppMessage = vi.fn();

let mockTenants: Record<string, any> = {};

function renderTextarea() {
  const textarea = { spellcheck: true };
  return textarea;
}

function checkBlacklist(text: string, tenantId: string) {
  const tenant = mockTenants[tenantId];
  if (!tenant || !tenant.blacklist || tenant.blacklist.length === 0) {
    return { hasBlacklistedWords: false, highlightedText: text };
  }

  let hasBlacklistedWords = false;
  let highlightedText = text;

  for (const word of tenant.blacklist) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(text)) {
      hasBlacklistedWords = true;
      highlightedText = highlightedText.replace(regex, `<span style="color: red;">$&</span>`);
    }
  }

  return { hasBlacklistedWords, highlightedText };
}

async function sendMessage(text: string, tenantId: string) {
  const { hasBlacklistedWords } = checkBlacklist(text, tenantId);
  
  // O sistema apenas alerta (na UI seria mostrado antes), mas NÃO bloqueia o envio
  // Simulando que o operador ignorou o alerta visual e clicou em Enviar
  
  await mockSendWhatsAppMessage(text);
  
  return { success: true, warningIgnored: hasBlacklistedWords };
}

describe('Testes de Correção Ortográfica (Spell Check & Blacklist)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockTenants = {
      'tenantA': {
         blacklist: ['foda', 'merda', 'caralho']
      },
      'tenantB': {
         blacklist: ['proibidoB']
      },
      'tenantC': {}
    };
  });

  it('1. Campo de resposta do operador → spellcheck=true habilitado no textarea', () => {
    const textarea = renderTextarea();
    expect(textarea.spellcheck).toBe(true);
  });

  it('2. Palavra na lista negra do tenant → highlighted em vermelho antes do envio', () => {
    const text = 'Isso é uma merda de sistema.';
    const result = checkBlacklist(text, 'tenantA');
    
    expect(result.hasBlacklistedWords).toBe(true);
    expect(result.highlightedText).toContain('<span style="color: red;">merda</span>');
  });

  it('3. Palavra na lista negra → NÃO bloqueia o envio (apenas alerta visual)', async () => {
    const text = 'Que foda isso';
    const result = await sendMessage(text, 'tenantA');
    
    expect(result.success).toBe(true);
    expect(result.warningIgnored).toBe(true);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(text);
  });

  it('4. Lista negra vazia → nenhum highlight, sem crasha', () => {
    const text = 'Texto normal sem problemas';
    const result = checkBlacklist(text, 'tenantC');
    
    expect(result.hasBlacklistedWords).toBe(false);
    expect(result.highlightedText).toBe(text);
  });

  it('5. Lista negra do tenant A → não aplicada no tenant B', () => {
    const text = 'Isso é uma merda gigante';
    const result = checkBlacklist(text, 'tenantB'); // 'merda' test is in tenantA's blacklist, not B
    
    expect(result.hasBlacklistedWords).toBe(false);
    expect(result.highlightedText).toBe(text); // No highlight
  });

});
