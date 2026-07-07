import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { infraLogger } from '../logging/logger';

/**
 * IA-04 — OCR de boleto + classificação de foto de campo.
 *
 * Usa GPT-4o (visão) para extrair dados estruturados de:
 * 1. Boletos (PDF/imagem) → linha digitável, valor, vencimento
 * 2. Fotos de campo (CTO, roteador, fibra) → equipamento, problema, severidade
 *
 * Flag: VISION_STRUCTURED_ENABLED (default false).
 * Fail-open: confidence < 0.6 → retorna null (comportamento atual).
 */

export function isVisionStructuredEnabled(): boolean {
  return (process.env.VISION_STRUCTURED_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export const BoletoSchema = z.object({
  linha_digitavel: z.string().regex(/^\d{47,48}$/).optional(),
  valor_cents: z.number().int().optional(),
  vencimento: z.string().optional(),
  beneficiario: z.string().max(120).optional(),
  is_boleto: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type BoletoExtraction = z.infer<typeof BoletoSchema>;

export const FieldPhotoSchema = z.object({
  equipment: z.enum(['cto', 'roteador', 'onu', 'cabo_fibra', 'poste', 'outro']),
  issue: z.enum(['fibra_rompida', 'led_vermelho', 'conector_sujo', 'sem_problema_visivel',
    'queimado', 'agua_umidade', 'outro']),
  severity: z.enum(['baixa', 'media', 'alta', 'critica']),
  recommended_action: z.string().max(300),
  confidence: z.number().min(0).max(1),
});

export type FieldPhotoClassification = z.infer<typeof FieldPhotoSchema>;

const visionModel = openai('gpt-4o');

export async function extractBoleto(
  imageOrPdfUrl: string,
  tenantId: string,
): Promise<BoletoExtraction | null> {
  if (!isVisionStructuredEnabled()) return null;

  try {
    const { object } = await generateObject({
      model: visionModel as any,
      schema: BoletoSchema,
      system: `Você extrai dados de boletos bancários brasileiros a partir de imagens.
Identifique: linha digitável (47-48 dígitos), valor em centavos (ex: R$99,90 = 9990),
data de vencimento (ISO yyyy-mm-dd), beneficiário.
Se NÃO for um boleto, retorne is_boleto=false e confidence>0.9.
Se for boleto mas estiver ilegível, retorne is_boleto=true e confidence<0.5.`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraia os dados deste boleto:' },
            { type: 'image', image: imageOrPdfUrl },
          ],
        } as any,
      ],
      headers: {
        'Helicone-Property-TenantId': tenantId,
        'Helicone-Property-UseCase': 'boleto-ocr',
      },
    });

    if (!object.is_boleto || object.confidence < 0.6) return null;

    infraLogger.info({ tenantId, confidence: object.confidence, hasLine: !!object.linha_digitavel }, 'Vision: boleto extracted');
    return object;
  } catch (err) {
    infraLogger.warn({ err, tenantId }, 'Vision: boleto extraction failed (fail-open)');
    return null;
  }
}

export async function classifyFieldPhoto(
  imageUrl: string,
  tenantId: string,
): Promise<FieldPhotoClassification | null> {
  if (!isVisionStructuredEnabled()) return null;

  try {
    const { object } = await generateObject({
      model: visionModel as any,
      schema: FieldPhotoSchema,
      system: `Você é um técnico de campo de ISP analisando fotos de equipamentos de rede.
Identifique: tipo de equipamento (cto, roteador, onu, cabo_fibra, poste),
problema visível (fibra_rompida, led_vermelho, etc.), severidade (baixa/media/alta/critica),
e ação recomendada (máx 300 caracteres).`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analise esta foto de campo de rede:' },
            { type: 'image', image: imageUrl },
          ],
        } as any,
      ],
      headers: {
        'Helicone-Property-TenantId': tenantId,
        'Helicone-Property-UseCase': 'field-photo',
      },
    });

    if (object.confidence < 0.6) return null;

    infraLogger.info({ tenantId, equipment: object.equipment, issue: object.issue, severity: object.severity }, 'Vision: field photo classified');
    return object;
  } catch (err) {
    infraLogger.warn({ err, tenantId }, 'Vision: field photo classification failed (fail-open)');
    return null;
  }
}

/**
 * Formata boleto extraído como extensão de system prompt para o agente.
 */
export function formatBoletoPrompt(boleto: BoletoExtraction): string {
  const parts: string[] = ['Boleto anexado pelo cliente:'];
  if (boleto.valor_cents !== undefined) parts.push(`valor R$${(boleto.valor_cents / 100).toFixed(2)}`);
  if (boleto.vencimento) parts.push(`vencimento ${boleto.vencimento}`);
  if (boleto.linha_digitavel) parts.push(`linha digitável ${boleto.linha_digitavel}`);
  parts.push('Compare com as faturas em aberto antes de responder.');
  return parts.join(', ');
}
