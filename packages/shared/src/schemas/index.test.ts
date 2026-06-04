import { describe, it, expect } from 'vitest';
import {
  createTicketSchema,
  createCustomerSchema,
  loginBodySchema,
  aiConfigSchema,
  paginationSchema,
} from './index';

describe('Zod Schemas', () => {
  describe('createTicketSchema', () => {
    it('aceita ticket válido', () => {
      const result = createTicketSchema.safeParse({ title: 'Internet caiu', priority: 'high' });
      expect(result.success).toBe(true);
    });

    it('rejeita título muito curto', () => {
      const result = createTicketSchema.safeParse({ title: 'ok' });
      expect(result.success).toBe(false);
      expect(result.error!.issues[0]!.path[0]).toBe('title');
    });

    it('usa prioridade padrão medium', () => {
      const result = createTicketSchema.safeParse({ title: 'Título válido aqui' });
      expect(result.success && result.data.priority).toBe('medium');
    });
  });

  describe('createCustomerSchema', () => {
    it('rejeita CPF com formato inválido', () => {
      const result = createCustomerSchema.safeParse({ name: 'João', cpf: '123' });
      expect(result.success).toBe(false);
    });

    it('aceita customer sem CPF', () => {
      const result = createCustomerSchema.safeParse({ name: 'João Silva' });
      expect(result.success).toBe(true);
    });
  });

  describe('loginBodySchema', () => {
    it('rejeita email inválido', () => {
      const result = loginBodySchema.safeParse({ email: 'nao-e-email', password: '123' });
      expect(result.success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('usa valores padrão quando não fornecido', () => {
      const result = paginationSchema.safeParse({});
      expect(result.success && result.data.page).toBe(1);
      expect(result.success && result.data.limit).toBe(20);
    });

    it('converte string para número automaticamente', () => {
      const result = paginationSchema.safeParse({ page: '2', limit: '50' });
      expect(result.success && result.data.page).toBe(2);
    });

    it('rejeita limit maior que 100', () => {
      const result = paginationSchema.safeParse({ limit: 200 });
      expect(result.success).toBe(false);
    });
  });
});
