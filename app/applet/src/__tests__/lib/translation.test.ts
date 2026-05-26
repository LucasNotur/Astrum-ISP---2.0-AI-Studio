import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExternalTranslationAPI = vi.fn();

const SUPPORTED_LANGS = ['es', 'en', 'fr', 'pt'];

async function translateText(text: string, sourceLang: string, targetLang: string) {
  if (sourceLang === targetLang) return text;
  
  if (!SUPPORTED_LANGS.includes(sourceLang) || !SUPPORTED_LANGS.includes(targetLang)) {
    return text; // Graceful fallback for unsupported languages
  }

  try {
    const result = await mockExternalTranslationAPI(text, sourceLang, targetLang);
    return result;
  } catch (error) {
    return text; // Graceful fallback if API unavailable (e.g. LibreTranslate off)
  }
}

async function processIncomingMessage(text: string, detectedLang: string) {
    const textInPt = await translateText(text, detectedLang, 'pt');
    return { translatedText: textInPt, originalLang: detectedLang };
}

async function prepareOutgoingMessage(textPt: string, targetLang: string) {
    const textOut = await translateText(textPt, 'pt', targetLang);
    return textOut;
}

describe('Testes de Tradução (LibreTranslate)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Mensagem em espanhol → traduzida para pt antes do pipeline da IA', async () => {
    mockExternalTranslationAPI.mockResolvedValue('Olá, meu vizinho');
    
    const result = await processIncomingMessage('Hola mi vecino', 'es');
    
    expect(mockExternalTranslationAPI).toHaveBeenCalledWith('Hola mi vecino', 'es', 'pt');
    expect(result.translatedText).toBe('Olá, meu vizinho');
  });

  it('2. Resposta da IA em pt → traduzida de volta para espanhol antes de enviar ao cliente', async () => {
    mockExternalTranslationAPI.mockResolvedValue('El plan básico cuesta 50');
    
    const result = await prepareOutgoingMessage('O plano básico custa 50', 'es');
    
    expect(mockExternalTranslationAPI).toHaveBeenCalledWith('O plano básico custa 50', 'pt', 'es');
    expect(result).toBe('El plan básico cuesta 50');
  });

  it('3. Mensagem em português → sem chamada à API de tradução', async () => {
    const result = await processIncomingMessage('Oi, tudo bem?', 'pt');
    
    expect(mockExternalTranslationAPI).not.toHaveBeenCalled();
    expect(result.translatedText).toBe('Oi, tudo bem?');
  });

  it('4. LibreTranslate indisponível → processado em pt sem erro (degradação graciosa)', async () => {
    mockExternalTranslationAPI.mockRejectedValue(new Error('LibreTranslate connection timeout'));
    
    // Tenta traduzir do ES pro PT, mas API falha
    const result = await processIncomingMessage('Internet caida', 'es');
    
    // Cai pro fallback gracioso: retorna a original, assumindo que IA se vira em PT com misturas
    expect(result.translatedText).toBe('Internet caida');
  });

  it('5. Idioma não suportado → processado em pt sem erro', async () => {
    const result = await processIncomingMessage('Xyz abc', 'xy'); // Idioma "xy" não suportado
    
    expect(mockExternalTranslationAPI).not.toHaveBeenCalled();
    expect(result.translatedText).toBe('Xyz abc'); // Retorna original
  });

});
