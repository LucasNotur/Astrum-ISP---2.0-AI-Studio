import { describe, it, expect } from 'vitest';
import { buildOnTheWayMessage, normalizePhone } from './field-notify.service';

describe('field-notify.service', () => {
  describe('buildOnTheWayMessage', () => {
    it('monta mensagem completa com ETA e link', () => {
      const msg = buildOnTheWayMessage({
        customerName: 'João', technicianName: 'Carlos', etaMinutes: 20, trackingUrl: 'https://astrum.app/t/abc',
      });
      expect(msg).toContain('Olá João!');
      expect(msg).toContain('Carlos está a caminho');
      expect(msg).toContain('20 min');
      expect(msg).toContain('https://astrum.app/t/abc');
    });

    it('funciona sem ETA', () => {
      const msg = buildOnTheWayMessage({ customerName: 'Ana', technicianName: 'Beto' });
      expect(msg).toContain('Beto está a caminho.');
      expect(msg).not.toContain('aproximadamente');
    });

    it('usa fallbacks quando faltam nomes', () => {
      const msg = buildOnTheWayMessage({});
      expect(msg).toContain('Olá!');
      expect(msg).toContain('nosso técnico está a caminho');
    });

    it('ignora ETA inválido (<= 0)', () => {
      const msg = buildOnTheWayMessage({ customerName: 'X', technicianName: 'Y', etaMinutes: 0 });
      expect(msg).not.toContain('aproximadamente');
    });

    it('ignora link em branco', () => {
      const msg = buildOnTheWayMessage({ customerName: 'X', technicianName: 'Y', trackingUrl: '   ' });
      expect(msg).not.toContain('Acompanhe');
    });
  });

  describe('normalizePhone', () => {
    it('prefixa 55 quando falta DDI', () => {
      expect(normalizePhone('(15) 99999-8888')).toBe('5515999998888');
    });

    it('mantém DDI 55 existente', () => {
      expect(normalizePhone('5515999998888')).toBe('5515999998888');
    });

    it('retorna null para número curto/ inválido', () => {
      expect(normalizePhone('123')).toBeNull();
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone(undefined)).toBeNull();
    });
  });
});
