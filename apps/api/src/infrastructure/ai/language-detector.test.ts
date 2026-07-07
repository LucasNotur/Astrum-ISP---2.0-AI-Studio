import { describe, it, expect } from 'vitest';
import { detectLanguage, isLiveTranslationEnabled, LANGUAGE_NAMES } from './language-detector';

describe('language-detector (IA-14)', () => {
  describe('12 fixtures do plano', () => {
    it('PT: 4 amostras', () => {
      expect(detectLanguage('Oi, quero falar sobre minha fatura, por favor.')).toBe('pt');
      expect(detectLanguage('Minha internet está caindo toda hora, pode me ajudar?')).toBe('pt');
      expect(detectLanguage('Bom dia, eu tenho uma dúvida sobre o meu plano')).toBe('pt');
      expect(detectLanguage('Não consigo pagar agora, vocês têm opção de parcelamento?')).toBe('pt');
    });

    it('EN: 4 amostras (incluindo fixture "hi, my internet is down")', () => {
      expect(detectLanguage('Hi, my internet is down since yesterday, please help.')).toBe('en');
      expect(detectLanguage('My bill is wrong, I need a refund and an explanation.')).toBe('en');
      expect(detectLanguage('The technician did not arrive, what is your schedule?')).toBe('en');
      expect(detectLanguage('I would like to upgrade my plan, what are the options?')).toBe('en');
    });

    it('ES: 4 amostras (incluindo fixture "hola no tengo internet")', () => {
      expect(detectLanguage('Hola, no tengo internet desde ayer, me puedes ayudar?')).toBe('es');
      expect(detectLanguage('Mi factura está mal, necesito una segunda vía por favor.')).toBe('es');
      expect(detectLanguage('El técnico no vino, ¿cuándo pueden venir?')).toBe('es');
      expect(detectLanguage('Quiero cambiar mi plan, ¿qué opciones tienen?')).toBe('es');
    });
  });

  describe('Conservador: pouco texto → pt', () => {
    it('string vazia → pt', () => {
      expect(detectLanguage('')).toBe('pt');
    });

    it('só 1 hit → pt (abaixo do MIN_HITS=2)', () => {
      expect(detectLanguage('oi')).toBe('pt');
      expect(detectLanguage('hello')).toBe('pt');
    });

    it('sem nenhuma stopword → pt', () => {
      expect(detectLanguage('fibra 200 mega plano')).toBe('pt');
    });
  });

  describe('empate', () => {
    it('empate pt+en com score maior → pt vence (conservador)', () => {
      // "the and de da" - 2 stopwords em, 2 em pt
      const r = detectLanguage('the and de da');
      expect(r).toBe('pt');
    });
  });

  describe('acentos normalizados', () => {
    it('remove acentos antes de tokenizar (NFD)', () => {
      expect(detectLanguage('Não tenho conexão, vocês podem me ajudar por favor?')).toBe('pt');
    });
  });

  describe('isLiveTranslationEnabled lê env', () => {
    it('retorna false sem env', () => {
      const orig = process.env.LIVE_TRANSLATION_ENABLED;
      delete process.env.LIVE_TRANSLATION_ENABLED;
      expect(isLiveTranslationEnabled()).toBe(false);
      if (orig !== undefined) process.env.LIVE_TRANSLATION_ENABLED = orig;
    });
    it('aceita "true" e variantes', () => {
      const orig = process.env.LIVE_TRANSLATION_ENABLED;
      process.env.LIVE_TRANSLATION_ENABLED = 'TRUE';
      expect(isLiveTranslationEnabled()).toBe(true);
      process.env.LIVE_TRANSLATION_ENABLED = orig;
    });
  });

  it('LANGUAGE_NAMES cobre os 3 idiomas', () => {
    expect(LANGUAGE_NAMES.pt).toBe('português');
    expect(LANGUAGE_NAMES.en).toBe('inglês');
    expect(LANGUAGE_NAMES.es).toBe('espanhol');
  });
});
