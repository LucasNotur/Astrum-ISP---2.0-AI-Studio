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

export const EnergyBillSchema = z.object({
  distribuidora: z.string().max(120).optional(),
  valor_cents: z.number().int().optional(),
  kwh: z.number().optional(),
  vencimento: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export type EnergyBillExtraction = z.infer<typeof EnergyBillSchema>;

export const CompetitorInvoiceSchema = z.object({
  operadora: z.string().max(120).optional(),
  plano: z.string().max(200).optional(),
  valor_cents: z.number().int().optional(),
  confidence: z.number().min(0).max(1),
});

export type CompetitorInvoiceExtraction = z.infer<typeof CompetitorInvoiceSchema>;

export type DocType = 'boleto' | 'energia' | 'concorrente' | 'desconhecido';

const DocTypeSchema = z.object({
  doc_type: z.enum(['boleto', 'energia', 'concorrente', 'desconhecido']),
});

const visionModel = openai('gpt-4o');
const classifyModel = openai('gpt-4o-mini');

export async function classifyDocumentType(
  imageUrl: string,
  tenantId: string,
): Promise<DocType> {
  if (!isVisionStructuredEnabled()) return 'desconhecido';
  try {
    const { object } = await generateObject({
      model: classifyModel as any,
      schema: DocTypeSchema,
      system: `Classifique o documento na imagem em uma das categorias:
- boleto: boleto bancário brasileiro
- energia: conta de luz / energia elétrica
- concorrente: fatura de outro provedor de internet/telecom
- desconhecido: qualquer outro tipo
Retorne apenas o tipo.`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Classifique este documento:' },
            { type: 'image', image: imageUrl },
          ],
        } as any,
      ],
      headers: {
        'Helicone-Property-TenantId': tenantId,
        'Helicone-Property-UseCase': 'ocr-classify',
      },
    });
    return object.doc_type;
  } catch (err) {
    infraLogger.warn({ err, tenantId }, 'Vision: doc classify failed (fail-open → desconhecido)');
    return 'desconhecido';
  }
}

export async function extractByType(
  imageUrl: string,
  docType: DocType,
  tenantId: string,
): Promise<{ extraction: Record<string, unknown>; confidence: number }> {
  if (docType === 'boleto') {
    const result = await extractBoleto(imageUrl, tenantId);
    if (result) return { extraction: result as any, confidence: result.confidence };
    return { extraction: {}, confidence: 0 };
  }
  if (docType === 'energia') {
    return extractEnergyBill(imageUrl, tenantId);
  }
  if (docType === 'concorrente') {
    return extractCompetitorInvoice(imageUrl, tenantId);
  }
  return { extraction: {}, confidence: 0 };
}

async function extractEnergyBill(
  imageUrl: string,
  tenantId: string,
): Promise<{ extraction: Record<string, unknown>; confidence: number }> {
  try {
    const { object } = await generateObject({
      model: visionModel as any,
      schema: EnergyBillSchema,
      system: `Você extrai dados de contas de energia elétrica brasileiras.
Identifique: distribuidora, valor em centavos (ex: R$150,00 = 15000), consumo kWh, vencimento (ISO yyyy-mm-dd).`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraia os dados desta conta de energia:' },
            { type: 'image', image: imageUrl },
          ],
        } as any,
      ],
      headers: {
        'Helicone-Property-TenantId': tenantId,
        'Helicone-Property-UseCase': 'ocr-extract-energia',
      },
    });
    return { extraction: object as any, confidence: object.confidence };
  } catch (err) {
    infraLogger.warn({ err, tenantId }, 'Vision: energy bill extraction failed');
    return { extraction: {}, confidence: 0 };
  }
}

async function extractCompetitorInvoice(
  imageUrl: string,
  tenantId: string,
): Promise<{ extraction: Record<string, unknown>; confidence: number }> {
  try {
    const { object } = await generateObject({
      model: visionModel as any,
      schema: CompetitorInvoiceSchema,
      system: `Você extrai dados de faturas de provedores de internet/telecom concorrentes.
Identifique: operadora, nome do plano, valor em centavos (ex: R$99,90 = 9990).`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraia os dados desta fatura de concorrente:' },
            { type: 'image', image: imageUrl },
          ],
        } as any,
      ],
      headers: {
        'Helicone-Property-TenantId': tenantId,
        'Helicone-Property-UseCase': 'ocr-extract-concorrente',
      },
    });
    return { extraction: object as any, confidence: object.confidence };
  } catch (err) {
    infraLogger.warn({ err, tenantId }, 'Vision: competitor invoice extraction failed');
    return { extraction: {}, confidence: 0 };
  }
}

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
