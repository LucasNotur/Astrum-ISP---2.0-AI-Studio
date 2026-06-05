import type { FastifyRequest, FastifyReply } from 'fastify';
import { z, type ZodSchema } from 'zod';

/**
 * Helper para validar body, params e query com Zod no Fastify.
 * Retorna erro 400 estruturado se validação falhar.
 */
export function validateBody(schema: any) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos na requisição.',
        errors: result.error.issues.map((issue: any) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    (request as any).validatedBody = result.data;
  };
}

export function validateParams(schema: any) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(request.params);
    if (!result.success) {
      return reply.status(400).send({
        code: 'INVALID_PARAMS',
        message: 'Parâmetros inválidos.',
        errors: result.error.issues.map((i: any) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    (request as any).validatedParams = result.data;
  };
}

export function validateQuery(schema: any) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(request.query);
    if (!result.success) {
      return reply.status(400).send({
        code: 'INVALID_QUERY',
        message: 'Query string inválida.',
        errors: result.error.issues.map((i: any) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    (request as any).validatedQuery = result.data;
  };
}
