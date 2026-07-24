import type { FastifyInstance } from 'fastify';
import { onboardNewTenant, isSlugAvailable } from './onboarding.service';
import { getTenantPlanLimits, checkPlanLimit, PLAN_LIMITS } from './plan-limits.service';
import { validateBody } from '../../infrastructure/validation/zod-validator';
import { z } from 'zod';

const onboardingSchema = z.object({
  tenantName: z.string().min(2).max(100),
  tenantSlug: z.string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  plan: z.enum(['starter', 'pro', 'enterprise']).default('starter'),
  adminName: z.string().min(2).max(100),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).max(128),
  botName: z.string().min(1).max(50).optional(),
  botPersonality: z.string().max(500).optional(),
});

export async function onboardingRoutes(fastify: FastifyInstance) {
  // Verificar disponibilidade de slug
  fastify.get('/api/v2/onboarding/check-slug/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };

    if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 3) {
      return reply.status(400).send({ code: 'INVALID_SLUG', available: false });
    }

    const available = await isSlugAvailable(slug);
    return { slug, available };
  });

  // Onboarding de novo tenant
  // Rota pública (ou protegida por super_admin key em produção)
  fastify.post('/api/v2/onboarding/register', {
    preHandler: [validateBody(onboardingSchema)],
  }, async (request, reply) => {
    const body = (request as any).validatedBody;

    // Verificar slug antes de processar
    const slugAvailable = await isSlugAvailable(body.tenantSlug);
    if (!slugAvailable) {
      return reply.status(409).send({
        code: 'SLUG_TAKEN',
        message: `O slug "${body.tenantSlug}" já está em uso. Escolha outro.`,
      });
    }

    const result = await onboardNewTenant(body);

    if (!result.success) {
      return reply.status(500).send({
        code: 'ONBOARDING_FAILED',
        message: 'Erro durante o cadastro. Tente novamente.',
        failedStep: result.failedStep,
        completedSteps: result.completedSteps,
      });
    }

    return reply.status(201).send({
      message: `Bem-vindo ao Astrum, ${body.tenantName}! 🎉`,
      tenantId: result.tenantId,
      adminUserId: result.adminUserId,
      completedSteps: result.completedSteps,
      nextStep: 'Faça login em /api/v2/auth/login com seu email e senha de admin.',
    });
  });

  // S91 — Auto-provisioning de instância Evolution API
  fastify.post('/api/v2/onboarding/provision-whatsapp', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { tenantId } = (request as any).user;
    const { slug } = request.body as { slug?: string };

    const { provisionEvolutionInstance, makeDefaultPorts } = await import(
      '../../adapters/whatsapp/evolution-provision.service'
    );

    const tenantSlug = slug || tenantId;
    const result = await provisionEvolutionInstance(tenantId, tenantSlug, makeDefaultPorts());

    return reply.status(201).send({
      instanceName: result.instanceName,
      qrCode: result.qrCode,
      webhookConfigured: result.webhookConfigured,
    });
  });

  // Rota: ver plano e uso atual
  fastify.get('/api/v2/billing/plan', {
    onRequest: [fastify.authenticate],
  }, async (request) => {
    const { tenantId } = (request as any).user;
    const limits = await getTenantPlanLimits(tenantId);

    const [customers, operators, documents] = await Promise.all([
      checkPlanLimit(tenantId, 'customers'),
      checkPlanLimit(tenantId, 'operators'),
      checkPlanLimit(tenantId, 'documents'),
    ]);

    return {
      plan: customers.plan,
      limits,
      usage: {
        customers: { current: customers.current, limit: customers.limit },
        operators: { current: operators.current, limit: operators.limit },
        documents: { current: documents.current, limit: documents.limit },
      },
      pricing: {
        currentPlanBRL: (limits.priceCentsPerMonth / 100).toLocaleString('pt-BR', {
          style: 'currency', currency: 'BRL',
        }),
        allPlans: Object.entries(PLAN_LIMITS).map(([name, p]) => ({
          name,
          priceBRL: (p.priceCentsPerMonth / 100).toLocaleString('pt-BR', {
            style: 'currency', currency: 'BRL',
          }),
          maxCustomers: p.maxCustomers === Infinity ? 'Ilimitado' : p.maxCustomers,
          ragEnabled: p.ragEnabled,
          cobraiEnabled: p.cobraiEnabled,
        })),
      },
    };
  });
}
