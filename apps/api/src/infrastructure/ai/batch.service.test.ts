import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('OPENAI_API_KEY', 'test-openai-key-for-vitest');

import { ChurnPredictionSchema, TicketClassificationSchema } from './batch.service';

describe('BatchService — Schemas de Validação', () => {
  it('ChurnPrediction válida passa no schema', () => {
    const valid = {
      customer_id: 'cust-123',
      churn_probability: 0.78,
      churn_risk: 'high',
      main_factors: ['Atraso de 15 dias', '5 tickets sem resolução'],
      recommended_action: 'urgent_retention',
      confidence_score: 0.85,
    };
    expect(() => ChurnPredictionSchema.parse(valid)).not.toThrow();
  });

  it('churn_probability fora de [0,1] é rejeitado', () => {
    const invalid = {
      customer_id: 'cust-123',
      churn_probability: 1.5, // inválido
      churn_risk: 'high',
      main_factors: ['Teste'],
      recommended_action: 'no_action',
      confidence_score: 0.9,
    };
    expect(() => ChurnPredictionSchema.parse(invalid)).toThrow();
  });

  it('mais de 3 main_factors é rejeitado', () => {
    const invalid = {
      customer_id: 'cust-123',
      churn_probability: 0.5,
      churn_risk: 'medium',
      main_factors: ['F1', 'F2', 'F3', 'F4'], // máx 3
      recommended_action: 'proactive_contact',
      confidence_score: 0.7,
    };
    expect(() => ChurnPredictionSchema.parse(invalid)).toThrow();
  });

  it('TicketClassification válida passa no schema', () => {
    const valid = {
      ticket_id: 'ticket-456',
      category: 'technical',
      subcategory: 'sem_sinal',
      priority_suggestion: 'high',
      auto_resolvable: false,
      estimated_resolution_minutes: 120,
      tags: ['fibra', 'sinal', 'urgente'],
    };
    expect(() => TicketClassificationSchema.parse(valid)).not.toThrow();
  });

  it('mais de 5 tags é rejeitado', () => {
    const invalid = {
      ticket_id: 'ticket-789',
      category: 'billing',
      subcategory: 'boleto',
      priority_suggestion: 'low',
      auto_resolvable: true,
      estimated_resolution_minutes: 10,
      tags: ['t1', 't2', 't3', 't4', 't5', 't6'], // máx 5
    };
    expect(() => TicketClassificationSchema.parse(invalid)).toThrow();
  });
});
