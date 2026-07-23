/**
 * PLANO I (Uber do Técnico) — Fase I-4 — Camada de IA de campo.
 *
 * Lógica pura e testável (a chamada ao LLM/visão vive fora):
 *  - predição de duração da OS (média histórica por tipo);
 *  - validação da foto "depois" (anti-"foto do chão");
 *  - detecção de anomalia de rota/tempo;
 *  - montagem do prompt de resumo + resumo de fallback determinístico.
 */

// ─── Previsão de duração ─────────────────────────────────────────────────────

export interface TypedDurationSample { type: string; execucaoMin: number }

export interface DurationPrediction {
  etaMin: number;
  basis: 'historico' | 'fallback';
  sample: number;
}

/** Prevê a duração de execução de uma OS pelo histórico do seu tipo. */
export function predictDuration(
  osType: string,
  history: TypedDurationSample[],
  fallbackMin = 60,
): DurationPrediction {
  const relevant = history.filter((h) => h.type === osType && h.execucaoMin > 0);
  if (relevant.length === 0) {
    return { etaMin: fallbackMin, basis: 'fallback', sample: 0 };
  }
  const avg = relevant.reduce((a, h) => a + h.execucaoMin, 0) / relevant.length;
  return { etaMin: Math.round(avg), basis: 'historico', sample: relevant.length };
}

// ─── Validação da foto "depois" ──────────────────────────────────────────────

export interface PhotoClassification {
  equipment: string;   // 'onu', 'cto', 'roteador', ... ou 'outro'
  confidence: number;  // 0..1
}

export interface PhotoValidation {
  valid: boolean;
  reason: string;
}

/**
 * Confere se a foto de conclusão realmente mostra equipamento de rede (e não o
 * chão/uma parede aleatória). Falha se a visão não reconheceu equipamento ou se a
 * confiança é baixa. Puro — recebe a classificação já feita pela visão.
 */
export function evaluateCompletionPhoto(
  classification: PhotoClassification | null,
  opts: { minConfidence?: number } = {},
): PhotoValidation {
  const minConfidence = opts.minConfidence ?? 0.55;
  if (!classification) {
    return { valid: false, reason: 'Não foi possível analisar a foto.' };
  }
  if (classification.equipment === 'outro' || !classification.equipment) {
    return { valid: false, reason: 'A foto não mostra equipamento de rede reconhecível (possível foto inválida).' };
  }
  if (classification.confidence < minConfidence) {
    return { valid: false, reason: `Confiança baixa (${Math.round(classification.confidence * 100)}%) — revisar manualmente.` };
  }
  return { valid: true, reason: `Foto válida: ${classification.equipment} reconhecido.` };
}

// ─── Anomalia de rota/tempo ──────────────────────────────────────────────────

export interface AnomalyInput {
  plannedKm?: number | null;
  actualKm?: number | null;
  execucaoMin?: number | null;
  historicalAvgMin?: number | null;
  /** Tolerância de km acima do planejado (fração). Default 0.5 (+50%). */
  kmTolerancePct?: number;
  /** Fator de tempo acima da média que dispara alerta. Default 3 (3×). */
  timeFactor?: number;
}

export interface AnomalyResult {
  hasAnomaly: boolean;
  anomalies: string[];
}

/** Detecta desvios grandes: km muito acima do planejado ou tempo muito acima da média. */
export function detectRouteAnomaly(input: AnomalyInput): AnomalyResult {
  const kmTol = input.kmTolerancePct ?? 0.5;
  const timeFactor = input.timeFactor ?? 3;
  const anomalies: string[] = [];

  if (input.plannedKm != null && input.actualKm != null && input.plannedKm > 0) {
    if (input.actualKm > input.plannedKm * (1 + kmTol)) {
      const pct = Math.round(((input.actualKm - input.plannedKm) / input.plannedKm) * 100);
      anomalies.push(`Km executado ${pct}% acima do planejado (${input.actualKm} vs ${input.plannedKm} km).`);
    }
  }

  if (input.execucaoMin != null && input.historicalAvgMin != null && input.historicalAvgMin > 0) {
    if (input.execucaoMin > input.historicalAvgMin * timeFactor) {
      anomalies.push(`Tempo de execução ${Math.round(input.execucaoMin / input.historicalAvgMin)}× a média do tipo (${input.execucaoMin} vs ${input.historicalAvgMin} min).`);
    }
  }

  return { hasAnomaly: anomalies.length > 0, anomalies };
}

// ─── Resumo automático da OS ─────────────────────────────────────────────────

export interface OsSummaryContext {
  type: string;
  client: string;
  checklistDone: number;
  checklistTotal: number;
  materials: string[];
  diagnoses: string[];
  execucaoMin: number | null;
}

/** Monta o prompt para o LLM (GPT-4o-mini) gerar o resumo da OS. */
export function buildOsSummaryPrompt(ctx: OsSummaryContext): string {
  const linhas = [
    `Tipo de serviço: ${ctx.type}`,
    `Cliente: ${ctx.client}`,
    `Checklist: ${ctx.checklistDone}/${ctx.checklistTotal} itens concluídos`,
    ctx.materials.length ? `Materiais aplicados: ${ctx.materials.join(', ')}` : 'Materiais aplicados: nenhum registrado',
    ctx.diagnoses.length ? `Diagnósticos IA: ${ctx.diagnoses.join('; ')}` : '',
    ctx.execucaoMin != null ? `Tempo de execução: ${ctx.execucaoMin} min` : '',
  ].filter(Boolean);
  return [
    'Você é um assistente técnico de um provedor de internet. Gere um resumo objetivo',
    '(2-3 frases, PT-BR) da ordem de serviço abaixo, para o comprovante do cliente:',
    '',
    ...linhas,
  ].join('\n');
}

/** Resumo determinístico (sem LLM) — usado como fallback ou modo offline. */
export function fallbackSummary(ctx: OsSummaryContext): string {
  const partes: string[] = [];
  partes.push(`Serviço de ${ctx.type} para ${ctx.client}`);
  if (ctx.checklistTotal > 0) {
    partes.push(`checklist ${ctx.checklistDone}/${ctx.checklistTotal} concluído`);
  }
  if (ctx.materials.length) {
    partes.push(`materiais: ${ctx.materials.join(', ')}`);
  }
  if (ctx.execucaoMin != null) {
    partes.push(`executado em ${ctx.execucaoMin} min`);
  }
  return partes.join(' · ') + '.';
}
