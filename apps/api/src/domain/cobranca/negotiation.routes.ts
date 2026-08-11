/**
 * D-03 — Rotas do negociador autônomo.
 * GET    /api/v2/cobranca/negotiation/policy          → policy atual
 * PUT    /api/v2/cobranca/negotiation/policy          → atualizar policy
 * POST   /api/v2/cobranca/negotiation/validate        → validar proposta
 * POST   /api/v2/cobranca/negotiation/agreements      → registrar acordo
 * GET    /api/v2/cobranca/negotiation/agreements      → listar acordos
 */
import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import {
  getPolicy,
  upsertPolicy,
  validateProposal,
  countFineWaiversThisYear,
  createAgreement,
  listAgreements,
  type NegotiationProposal,
} from './negotiation-policy.service';

export async function negotiationRoutes(app: FastifyInstance) {
  app.get('/api/v2/cobranca/negotiation/policy', {
    preHandler: [app.authenticate, requirePermission('billing', 'read')],
  }, async (request) => {
    const { tenantId } = request.user as { tenantId: string };
    return getPolicy(tenantId);
  });

  app.put('/api/v2/cobranca/negotiation/policy', {
    preHandler: [app.authenticate, requirePermission('billing', 'write')],
  }, async (request) => {
    const { tenantId } = request.user as { tenantId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    await upsertPolicy({
      tenantId,
      maxInstallments: Number(body.maxInstallments ?? 3),
      maxDiscountPct: Number(body.maxDiscountPct ?? 10),
      fineWaiverPerYear: Number(body.fineWaiverPerYear ?? 1),
      autoApproveUpToCents: Number(body.autoApproveUpToCents ?? 50000),
    });
    return { ok: true };
  });

  app.post('/api/v2/cobranca/negotiation/validate', {
    preHandler: [app.authenticate, requirePermission('billing', 'read')],
  }, async (request) => {
    const { tenantId } = request.user as { tenantId: string };
    const proposal = (request.body ?? {}) as NegotiationProposal;
    const policy = await getPolicy(tenantId);
    const waivers = proposal.waiveFine
      ? await countFineWaiversThisYear(tenantId, proposal.customerId)
      : 0;
    return validateProposal(proposal, policy, waivers);
  });

  app.post('/api/v2/cobranca/negotiation/agreements', {
    preHandler: [app.authenticate, requirePermission('billing', 'write')],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;

    const customerId = body.customerId as string;
    const originalDebtCents = Number(body.originalDebtCents ?? 0);
    const installments = Number(body.installments ?? 1);
    const discountPct = Number(body.discountPct ?? 0);
    const fineWaived = Boolean(body.fineWaived);

    // BILL-01 (auditoria 2026-08-10): ANTES o acordo era gravado direto com os valores do body,
    // sem passar pela alçada (validateProposal só existia na rota /validate consultiva) — um
    // operador registrava 99% de desconto / valor R$0,01. Agora a alçada é OBRIGATÓRIA aqui.
    const policy = await getPolicy(tenantId);
    const waivers = fineWaived ? await countFineWaiversThisYear(tenantId, customerId) : 0;
    const verdict = validateProposal(
      { customerId, debtCents: originalDebtCents, installments, discountPct, waiveFine: fineWaived },
      policy,
      waivers,
    );
    if (!verdict.allowed) {
      return reply.code(422).send({ error: 'POLICY_VIOLATION', reasons: verdict.reasons });
    }

    // BILL-01: recomputar o valor no servidor a partir de inputs já validados — o cliente NÃO
    // dita agreedAmountCents (senão mandaria discountPct=5 aprovado + agreedAmountCents=1).
    const agreedAmountCents = Math.max(0, Math.round(originalDebtCents * (1 - discountPct / 100)));

    try {
      const id = await createAgreement({
        tenantId,
        customerId,
        originalDebtCents,
        agreedAmountCents,
        installments,
        discountPct,
        fineWaived,
        status: 'active',
      });
      return reply.code(201).send({ id, agreedAmountCents });
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get('/api/v2/cobranca/negotiation/agreements', {
    preHandler: [app.authenticate, requirePermission('billing', 'read')],
  }, async (request) => {
    const { tenantId } = request.user as { tenantId: string };
    const { status } = request.query as { status?: string };
    const agreements = await listAgreements(tenantId, { status });
    return { agreements };
  });
}
