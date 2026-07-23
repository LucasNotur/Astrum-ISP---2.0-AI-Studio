import { describe, it, expect } from 'vitest';
import {
  predictDuration,
  evaluateCompletionPhoto,
  detectRouteAnomaly,
  buildOsSummaryPrompt,
  fallbackSummary,
  type TypedDurationSample,
  type OsSummaryContext,
} from './field-ai.service';

const HISTORY: TypedDurationSample[] = [
  { type: 'instalacao', execucaoMin: 60 },
  { type: 'instalacao', execucaoMin: 80 },
  { type: 'reparo', execucaoMin: 30 },
];

const CTX: OsSummaryContext = {
  type: 'instalacao', client: 'João Silva',
  checklistDone: 4, checklistTotal: 4,
  materials: ['ONU Fiberhome', 'Cabo drop 100m'],
  diagnoses: ['roteador — sem defeito'],
  execucaoMin: 70,
};

describe('field-ai.service', () => {
  describe('predictDuration', () => {
    it('usa a média histórica do tipo', () => {
      const p = predictDuration('instalacao', HISTORY);
      expect(p.etaMin).toBe(70); // (60+80)/2
      expect(p.basis).toBe('historico');
      expect(p.sample).toBe(2);
    });

    it('cai no fallback sem histórico do tipo', () => {
      const p = predictDuration('mudanca_endereco', HISTORY, 45);
      expect(p.etaMin).toBe(45);
      expect(p.basis).toBe('fallback');
      expect(p.sample).toBe(0);
    });
  });

  describe('evaluateCompletionPhoto', () => {
    it('aprova equipamento reconhecido com boa confiança', () => {
      const v = evaluateCompletionPhoto({ equipment: 'onu', confidence: 0.9 });
      expect(v.valid).toBe(true);
    });

    it('reprova "foto do chão" (equipment=outro)', () => {
      const v = evaluateCompletionPhoto({ equipment: 'outro', confidence: 0.9 });
      expect(v.valid).toBe(false);
      expect(v.reason).toContain('não mostra equipamento');
    });

    it('reprova confiança baixa', () => {
      const v = evaluateCompletionPhoto({ equipment: 'cto', confidence: 0.3 });
      expect(v.valid).toBe(false);
      expect(v.reason).toContain('Confiança baixa');
    });

    it('reprova quando não há classificação', () => {
      expect(evaluateCompletionPhoto(null).valid).toBe(false);
    });
  });

  describe('detectRouteAnomaly', () => {
    it('sem anomalia quando dentro do esperado', () => {
      const r = detectRouteAnomaly({ plannedKm: 20, actualKm: 22, execucaoMin: 60, historicalAvgMin: 55 });
      expect(r.hasAnomaly).toBe(false);
      expect(r.anomalies).toEqual([]);
    });

    it('acusa km muito acima do planejado', () => {
      const r = detectRouteAnomaly({ plannedKm: 20, actualKm: 40 });
      expect(r.hasAnomaly).toBe(true);
      expect(r.anomalies[0]).toContain('acima do planejado');
    });

    it('acusa tempo 3× acima da média', () => {
      const r = detectRouteAnomaly({ execucaoMin: 200, historicalAvgMin: 60 });
      expect(r.hasAnomaly).toBe(true);
      expect(r.anomalies[0]).toContain('a média do tipo');
    });

    it('ignora campos ausentes sem quebrar', () => {
      expect(detectRouteAnomaly({}).hasAnomaly).toBe(false);
    });
  });

  describe('buildOsSummaryPrompt', () => {
    it('inclui os dados-chave no prompt', () => {
      const prompt = buildOsSummaryPrompt(CTX);
      expect(prompt).toContain('instalacao');
      expect(prompt).toContain('João Silva');
      expect(prompt).toContain('4/4');
      expect(prompt).toContain('ONU Fiberhome');
    });
  });

  describe('fallbackSummary', () => {
    it('gera resumo determinístico em PT-BR', () => {
      const s = fallbackSummary(CTX);
      expect(s).toContain('instalacao');
      expect(s).toContain('João Silva');
      expect(s).toContain('4/4');
      expect(s).toContain('70 min');
      expect(s.endsWith('.')).toBe(true);
    });

    it('funciona com contexto mínimo', () => {
      const s = fallbackSummary({ type: 'reparo', client: 'X', checklistDone: 0, checklistTotal: 0, materials: [], diagnoses: [], execucaoMin: null });
      expect(s).toContain('reparo');
    });
  });
});
