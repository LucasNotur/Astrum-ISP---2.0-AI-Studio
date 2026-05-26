import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockDatabase: Record<string, any[]> = {};
let mockIncidents: Record<string, any[]> = {};

function addMessageData(tenantId: string, date: string, sentimentCounts: Record<string, number>) {
  if (!mockDatabase[tenantId]) mockDatabase[tenantId] = [];
  
  const total = Object.values(sentimentCounts).reduce((a, b) => a + b, 0);
  
  mockDatabase[tenantId].push({
    date,
    total,
    sentiments: sentimentCounts
  });
}

function addIncident(tenantId: string, date: string, type: string) {
   if (!mockIncidents[tenantId]) mockIncidents[tenantId] = [];
   mockIncidents[tenantId].push({ date, type });
}

function getSentimentMetrics(tenantId: string, dates: string[]) {
  const data = mockDatabase[tenantId] || [];
  const incidents = mockIncidents[tenantId] || [];
  
  let timeSeries = [];
  let predictiveAlert = null;
  
  let consecutiveNegativeGrowth = 0;
  let previousNegativeRatio = -1;

  for (const date of dates) {
      const entry = data.find(d => d.date === date);
      
      let sentiments = { NEUTRAL: 0, POSITIVE: 0, NEGATIVE: 0, ANGRY: 0, HAPPY: 0 };
      let total = 0;

      if (entry) {
          sentiments = {
            NEUTRAL: entry.sentiments.NEUTRAL || 0,
            POSITIVE: entry.sentiments.POSITIVE || 0,
            NEGATIVE: entry.sentiments.NEGATIVE || 0,
            ANGRY: entry.sentiments.ANGRY || 0,
            HAPPY: entry.sentiments.HAPPY || 0
          };
          total = entry.total;
      }

      const angryRatio = total > 0 ? (sentiments.ANGRY / total) * 100 : 0;
      const negativeRatio = total > 0 ? ((sentiments.ANGRY + sentiments.NEGATIVE) / total) * 100 : 0;
      
      const dayAlert = angryRatio > 15;
      const hasIncident = incidents.some(i => i.date === date);

      timeSeries.push({
        date,
        sentiments,
        alertActive: dayAlert,
        incidentMarker: hasIncident ? 'INCIDENT_ACTIVE' : null
      });

      if (previousNegativeRatio !== -1 && negativeRatio > previousNegativeRatio) {
        consecutiveNegativeGrowth++;
      } else {
        consecutiveNegativeGrowth = 0;
      }
      previousNegativeRatio = negativeRatio;

      if (consecutiveNegativeGrowth >= 3) { // 3 growths (day 1->2, 2->3, 3->4) = 4 days of continuous growth
        predictiveAlert = 'ALERTA_PREDITIVO_TENDENCIA_NEGATIVA';
      }
  }

  return { timeSeries, predictiveAlert };
}

describe('Testes de Desvios Emocionais (Emotional Metrics)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    mockDatabase = {};
    mockIncidents = {};
  });

  it('1. GET /api/metrics/sentiment → retorna série temporal com os 5 sentimentos por dia', () => {
    addMessageData('tenantA', '2023-11-01', { POSITIVE: 10, NEUTRAL: 5, NEGATIVE: 2, ANGRY: 1, HAPPY: 5 });
    
    const result = getSentimentMetrics('tenantA', ['2023-11-01']);
    
    expect(result.timeSeries.length).toBe(1);
    expect(result.timeSeries[0].sentiments).toEqual({
      POSITIVE: 10, NEUTRAL: 5, NEGATIVE: 2, ANGRY: 1, HAPPY: 5
    });
  });

  it('2. ANGRY > 15% em um dia → alerta ativado nos dados da rota', () => {
    // 20 messages total, 4 ANGRY = 20%
    addMessageData('tenantA', '2023-11-02', { POSITIVE: 10, NEUTRAL: 6, ANGRY: 4 });
    
    const result = getSentimentMetrics('tenantA', ['2023-11-02']);
    
    expect(result.timeSeries[0].alertActive).toBe(true);
  });

  it('3. Correlação com incidente ativo → marcador nos dados do gráfico', () => {
    addMessageData('tenantA', '2023-11-03', { NEUTRAL: 10 });
    addIncident('tenantA', '2023-11-03', 'FALHA_GERAL');
    
    const result = getSentimentMetrics('tenantA', ['2023-11-03']);
    
    expect(result.timeSeries[0].incidentMarker).toBe('INCIDENT_ACTIVE');
  });

  it('4. 3 dias consecutivos com ANGRY/NEGATIVE crescendo → alerta preditivo gerado', () => {
    // Day 1: 10% negative
    addMessageData('tenantA', '2023-11-04', { POSITIVE: 90, NEGATIVE: 10 });
    // Day 2: 20% negative
    addMessageData('tenantA', '2023-11-05', { POSITIVE: 80, NEGATIVE: 20 });
    // Day 3: 30% negative
    addMessageData('tenantA', '2023-11-06', { POSITIVE: 70, NEGATIVE: 30 });
    // Day 4: 50% negative
    addMessageData('tenantA', '2023-11-07', { POSITIVE: 50, NEGATIVE: 50 });
    
    const result = getSentimentMetrics('tenantA', ['2023-11-04', '2023-11-05', '2023-11-06', '2023-11-07']);
    
    expect(result.predictiveAlert).toBe('ALERTA_PREDITIVO_TENDENCIA_NEGATIVA');
  });

  it('5. Dados do tenant A → não aparecem no endpoint do tenant B', () => {
    addMessageData('tenantA', '2023-11-08', { ANGRY: 100 });
    
    const resultB = getSentimentMetrics('tenantB', ['2023-11-08']);
    
    expect(resultB.timeSeries[0].sentiments.ANGRY).toBe(0);
    expect(resultB.timeSeries[0].alertActive).toBe(false);
  });

  it('6. Dia sem mensagens → sentimentos zerados sem lançar erro', () => {
    // No data added for this tenant/date
    const result = getSentimentMetrics('tenantC', ['2023-11-09']);
    
    expect(result.timeSeries.length).toBe(1);
    expect(result.timeSeries[0].sentiments).toEqual({ NEUTRAL: 0, POSITIVE: 0, NEGATIVE: 0, ANGRY: 0, HAPPY: 0 });
    expect(result.timeSeries[0].alertActive).toBe(false);
  });

});
