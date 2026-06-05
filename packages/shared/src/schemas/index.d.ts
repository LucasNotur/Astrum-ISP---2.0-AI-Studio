import { z } from 'zod';
export declare const uuidSchema: z.ZodString;
export declare const paginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const tenantParamSchema: z.ZodObject<{
    tenantId: z.ZodString;
}, z.core.$strip>;
export declare const loginBodySchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export declare const refreshBodySchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, z.core.$strip>;
export declare const registerBodySchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    tenantId: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<{
        admin: "admin";
        operator: "operator";
        viewer: "viewer";
    }>>;
}, z.core.$strip>;
export declare const createTicketSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    customerId: z.ZodOptional<z.ZodString>;
    priority: z.ZodDefault<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        critical: "critical";
    }>>;
}, z.core.$strip>;
export declare const updateTicketSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        open: "open";
        in_progress: "in_progress";
        resolved: "resolved";
        closed: "closed";
    }>>;
    priority: z.ZodOptional<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
        critical: "critical";
    }>>;
    assignedTo: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const createCustomerSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    cpf: z.ZodOptional<z.ZodString>;
    planId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const cobraiRuleSchema: z.ZodObject<{
    name: z.ZodString;
    daysOverdue: z.ZodNumber;
    action: z.ZodEnum<{
        send_message: "send_message";
        suspend_signal: "suspend_signal";
        reactivate: "reactivate";
        notify_human: "notify_human";
    }>;
    messageTemplate: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const aiConfigSchema: z.ZodObject<{
    botName: z.ZodOptional<z.ZodString>;
    personality: z.ZodOptional<z.ZodString>;
    temperature: z.ZodOptional<z.ZodNumber>;
    maxTokensPerMessage: z.ZodOptional<z.ZodNumber>;
    securityThreshold: z.ZodOptional<z.ZodNumber>;
    autoSuspendEnabled: z.ZodOptional<z.ZodBoolean>;
    cobraiEnabled: z.ZodOptional<z.ZodBoolean>;
    customInstructions: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const sendMessageSchema: z.ZodObject<{
    content: z.ZodString;
    conversationId: z.ZodOptional<z.ZodString>;
    customerId: z.ZodOptional<z.ZodString>;
    channel: z.ZodDefault<z.ZodEnum<{
        facebook: "facebook";
        whatsapp: "whatsapp";
        webchat: "webchat";
    }>>;
}, z.core.$strip>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type CreateTicket = z.infer<typeof createTicketSchema>;
export type UpdateTicket = z.infer<typeof updateTicketSchema>;
export type CreateCustomer = z.infer<typeof createCustomerSchema>;
export type CobraiRule = z.infer<typeof cobraiRuleSchema>;
export type AIConfig = z.infer<typeof aiConfigSchema>;
