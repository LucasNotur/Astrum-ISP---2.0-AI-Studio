import type { FastifyInstance } from 'fastify';
import { withTenantRLS, isTenantRlsAvailable } from '../../infrastructure/database/tenant-rls';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { securityLogger } from '../../infrastructure/logging/logger';
import { anonymizeCustomerByEmail, purgeExternalCustomerData } from './lgpd-expunge.service';
import {
  exportCustomerByEmail,
  defaultLgpdExportDb,
  type LgpdExportDb,
} from './lgpd-export.service';

export interface LgpdRoutesOptions {
  // Injetável para teste; em produção usa o DB Supabase real (service_role, tenant-scoped).
  exportDb?: LgpdExportDb;
}

/**
 * LGPD Art. 18/19 — direito ao apagamento (expurgo) + acesso/portabilidade (export).
 *
 * POST /api/v2/lgpd/expunge  body: { email }
 *  - Admin/super_admin apenas (operação DESTRUTIVA).
 *  - tenant vem do JWT (NUNCA do body — evita expurgo cross-tenant forjado).
 *  - Anonimiza (não deleta) via withTenantRLS (RLS bloqueia cross-tenant).
 *  - Registra em audit_log via service_role (a policy nega insert de authenticated).
 *
 * POST /api/v2/lgpd/export  body: { email }
 *  - Admin/super_admin apenas (acesso a PII de titular = acesso sensível auditado).
 *  - tenant vem do JWT (NUNCA do body — evita export cross-tenant forjado).
 *  - Devolve o pacote de dados do titular; registra em audit_log.
 */
export async function lgpdRoutes(app: FastifyInstance, opts: LgpdRoutesOptions = {}) {
  const exportDb = opts.exportDb ?? defaultLgpdExportDb;

  app.post('/api/v2/lgpd/export', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const user = (request as any).user ?? {};
    const { tenantId, userId, role } = user;

    // Gate: só admin/super_admin acessam PII de titular (LGPD — acesso sensível).
    if (!['admin', 'super_admin'].includes(role)) {
      return reply.code(403).send({ code: 'FORBIDDEN', message: 'Apenas administradores podem exportar dados de titular (LGPD).' });
    }

    const { email } = (request.body ?? {}) as { email?: string };
    if (!email || !email.trim()) {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'E-mail do titular é obrigatório.' });
    }

    let pkg;
    try {
      pkg = await exportCustomerByEmail(exportDb, tenantId, email);
    } catch (err) {
      securityLogger.error({ err: (err as Error).message, tenantId, actor: userId }, 'LGPD export falhou');
      return reply.code(500).send({ code: 'EXPORT_FAILED', message: 'Falha ao exportar dados do titular.' });
    }

    if (!pkg.found) {
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Nenhum cliente com esse e-mail neste provedor.' });
    }

    // Acesso sensível a PII → auditar (imutável, migration 095) via service_role.
    try {
      await supabaseAdmin.from('audit_log').insert({
        tenant_id: tenantId,
        user_id: userId ?? null,
        action: 'lgpd_export',
        resource: 'customer',
        resource_id: pkg.customerIds[0],
        ip_address: request.ip,
        user_agent: request.headers['user-agent'] ?? null,
        metadata: { email: email.trim(), customerIds: pkg.customerIds, counts: pkg.counts },
      });
    } catch (err) {
      securityLogger.error({ err: (err as Error).message, tenantId, actor: userId }, 'LGPD export: pacote gerado mas AUDITORIA falhou');
    }

    securityLogger.warn({ tenantId, actor: userId, counts: pkg.counts }, 'LGPD export executado');
    return reply.send(pkg);
  });

  app.post('/api/v2/lgpd/expunge', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const user = (request as any).user ?? {};
    const { tenantId, userId, role } = user;

    // Gate: só admin/super_admin executam expurgo (destrutivo + LGPD).
    if (!['admin', 'super_admin'].includes(role)) {
      return reply.code(403).send({ code: 'FORBIDDEN', message: 'Apenas administradores podem expurgar dados (LGPD).' });
    }

    const { email } = (request.body ?? {}) as { email?: string };
    if (!email || !email.trim()) {
      return reply.code(400).send({ code: 'BAD_REQUEST', message: 'E-mail do titular é obrigatório.' });
    }

    // Expurgo exige a conexão RLS (DATABASE_URL) — é destrutivo, não roda sem a rede de RLS.
    if (!isTenantRlsAvailable()) {
      return reply.code(503).send({ code: 'RLS_UNAVAILABLE', message: 'Expurgo indisponível: DATABASE_URL não configurada.' });
    }

    let customerIds: string[];
    try {
      customerIds = await withTenantRLS(tenantId, (db) => anonymizeCustomerByEmail(db, tenantId, email));
    } catch (err) {
      securityLogger.error({ err: (err as Error).message, tenantId, actor: userId }, 'LGPD expunge falhou');
      return reply.code(500).send({ code: 'EXPUNGE_FAILED', message: 'Falha ao expurgar. Nenhum dado foi anonimizado parcialmente sem registro.' });
    }

    if (customerIds.length === 0) {
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Nenhum cliente com esse e-mail neste provedor.' });
    }

    // Expurgo dos armazenamentos de PII FORA do Postgres (memória Zep + vetores
    // Qdrant). Roda FORA da transação RLS: são chamadas de rede e best-effort —
    // uma falha aqui NÃO desfaz a anonimização Supabase (já commitada), mas é
    // registrada na auditoria para rastrear purga parcial (compliance).
    const externalPurge = await purgeExternalCustomerData(tenantId, customerIds);

    // Trilha de auditoria (imutável, migration 095) via service_role.
    try {
      await supabaseAdmin.from('audit_log').insert({
        tenant_id: tenantId,
        user_id: userId ?? null,
        action: 'lgpd_expunge',
        resource: 'customer',
        resource_id: customerIds[0],
        ip_address: request.ip,
        user_agent: request.headers['user-agent'] ?? null,
        metadata: { email: email.trim(), customerIds, count: customerIds.length, externalPurge },
      });
    } catch (err) {
      // A anonimização JÁ ocorreu (o que a lei exige). Falha só no registro → loga alto.
      securityLogger.error({ err: (err as Error).message, tenantId, customerIds }, 'LGPD expunge: anonimização OK mas AUDITORIA falhou');
    }

    securityLogger.warn({ tenantId, actor: userId, count: customerIds.length, externalPurge }, 'LGPD expunge executado');
    return reply.send({ expunged: customerIds.length, customerIds, externalPurge });
  });
}
