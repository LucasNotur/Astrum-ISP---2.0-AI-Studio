import { z } from 'zod';
// ── Schemas base reutilizáveis ───────────────────────
export const uuidSchema = z.string().uuid('ID deve ser um UUID válido');
export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const tenantParamSchema = z.object({
    tenantId: uuidSchema,
});
// ── Auth ────────────────────────────────────────────
export const loginBodySchema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(1, 'Senha é obrigatória'),
});
export const refreshBodySchema = z.object({
    refreshToken: z.string().min(10, 'Refresh token inválido'),
});
export const registerBodySchema = z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(128),
    tenantId: uuidSchema,
    role: z.enum(['admin', 'operator', 'viewer']).default('operator'),
});
// ── Tickets ────────────────────────────────────────
export const createTicketSchema = z.object({
    title: z.string().min(3, 'Título deve ter no mínimo 3 caracteres').max(200),
    description: z.string().max(5000).optional(),
    customerId: uuidSchema.optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
});
export const updateTicketSchema = z.object({
    title: z.string().min(3).max(200).optional(),
    description: z.string().max(5000).optional(),
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    assignedTo: uuidSchema.optional(),
});
// ── Customers ──────────────────────────────────────
export const createCustomerSchema = z.object({
    name: z.string().min(2).max(200),
    email: z.string().email().optional(),
    phone: z.string().regex(/^\d{10,11}$/, 'Telefone deve ter 10 ou 11 dígitos').optional(),
    cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos').optional(),
    planId: z.string().optional(),
});
// ── CobrAI ─────────────────────────────────────────
export const cobraiRuleSchema = z.object({
    name: z.string().min(2).max(100),
    daysOverdue: z.number().int().min(1).max(365),
    action: z.enum(['send_message', 'suspend_signal', 'reactivate', 'notify_human']),
    messageTemplate: z.string().max(2000).optional(),
});
// ── AI Config ──────────────────────────────────────
export const aiConfigSchema = z.object({
    botName: z.string().min(1).max(50).optional(),
    personality: z.string().max(500).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokensPerMessage: z.number().int().min(100).max(4000).optional(),
    securityThreshold: z.number().min(0).max(1).optional(),
    autoSuspendEnabled: z.boolean().optional(),
    cobraiEnabled: z.boolean().optional(),
    customInstructions: z.string().max(3000).optional(),
});
// ── Mensagens ──────────────────────────────────────
export const sendMessageSchema = z.object({
    content: z.string().min(1).max(2000),
    conversationId: uuidSchema.optional(),
    customerId: uuidSchema.optional(),
    channel: z.enum(['whatsapp', 'webchat', 'facebook']).default('whatsapp'),
});
//# sourceMappingURL=index.js.map