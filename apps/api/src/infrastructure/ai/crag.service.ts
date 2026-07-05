import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { infraLogger } from '../logging/logger';
import type { ICragPort, IContextGradeResult, ISelfCheckResult } from '../../domain/ports/crag.port';

export const ContextGradeSchema = z.object({
  grade: z.enum(['relevant', 'ambiguous', 'irrelevant']),
  confidence: z.number().min(0).max(1),
  missing_info: z.string().max(300).describe('O que falta no contexto para responder'),
});

export const SelfCheckSchema = z.object({
  grounded: z.boolean().describe('true se TODAS as afirmações factuais têm suporte nas fontes'),
  unsupported_claims: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
});

const RewrittenQuerySchema = z.object({
  rewritten: z.string().max(200),
});

const grader = openai('gpt-4o-mini'); // RN3: grading é sempre mini

export class CragService implements ICragPort {
  async gradeContext(
    query: string, ragContext: string, dbContext: string, tenantId: string,
  ): Promise<IContextGradeResult> {
    const { object } = await generateObject({
      model: grader as any,
      schema: ContextGradeSchema,
      system: 'Você avalia se o CONTEXTO recuperado é suficiente para responder a PERGUNTA de um cliente de ISP. Seja rigoroso: contexto genérico ou fora do assunto = irrelevant.',
      messages: [{ role: 'user', content: `PERGUNTA: ${query}\n\nCONTEXTO:\n${ragContext}\n${dbContext}` }],
      headers: { 'Helicone-Property-TenantId': tenantId, 'Helicone-Property-UseCase': 'crag-grade' },
    });
    infraLogger.info({ tenantId, grade: object.grade, confidence: object.confidence }, 'CRAG grade done');
    return object;
  }

  async rewriteQuery(query: string, missingInfo: string, tenantId: string): Promise<string> {
    const { object } = await generateObject({
      model: grader as any,
      schema: RewrittenQuerySchema,
      system: 'Reescreva a pergunta do cliente como uma query de busca técnica de ISP, incorporando a informação que faltou na primeira busca. Responda só a query.',
      messages: [{ role: 'user', content: `Pergunta original: ${query}\nFaltou: ${missingInfo}` }],
      headers: { 'Helicone-Property-TenantId': tenantId, 'Helicone-Property-UseCase': 'crag-rewrite' },
    });
    infraLogger.info({ tenantId, rewritten: object.rewritten.slice(0, 80) }, 'CRAG rewrite done');
    return object.rewritten;
  }

  async selfCheck(
    response: string, ragContext: string, dbContext: string, tenantId: string,
  ): Promise<ISelfCheckResult> {
    const { object } = await generateObject({
      model: grader as any,
      schema: SelfCheckSchema,
      system: 'Você verifica se a RESPOSTA de um agente de ISP é sustentada pelas FONTES. Afirmações sobre valores, datas, status de fatura ou procedimentos técnicos sem fonte = unsupported. Cortesia/saudação não conta como claim.',
      messages: [{ role: 'user', content: `RESPOSTA:\n${response}\n\nFONTES:\n${ragContext}\n${dbContext}` }],
      headers: { 'Helicone-Property-TenantId': tenantId, 'Helicone-Property-UseCase': 'crag-selfcheck' },
    });
    infraLogger.info({ tenantId, grounded: object.grounded, issues: object.unsupported_claims.length }, 'CRAG selfcheck done');
    return object;
  }
}

export const cragService = new CragService();