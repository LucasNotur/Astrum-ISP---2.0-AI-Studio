import { Worker, Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { connection } from '../../../apps/api/src/infrastructure/cache/redis.client';
import { supabaseAdmin } from '../../../apps/api/src/infrastructure/database/supabase.client';
import { infraLogger } from '../../../apps/api/src/infrastructure/logging/logger';
import { extractFeatures, getActiveCustomers } from '../../../apps/api/src/domain/ml/churn-features.service';
import { computeChurnScore } from '../../../apps/api/src/domain/ml/churn-score';

/**
 * IA-07 — Churn Worker.
 *
 * Job repetível diário (03:00 BRT = 06:00 UTC).
 * Para cada tenant com clientes ativos, extrai features, calcula score
 * e persiste na tabela churn_scores.
 *
 * Flag: CHURN_ENGINE=on|off (default off).
 */

const CHURN_QUEUE = 'astrum:churn';

function isChurnEngineEnabled(): boolean {
  return (process.env.CHURN_ENGINE ?? 'off').trim().toLowerCase() === 'on';
}

export interface ChurnJobData {
  tenantId: string;
}

async function processChurnJob(job: Job<ChurnJobData>): Promise<void> {
  const { tenantId } = job.data;

  if (!isChurnEngineEnabled()) {
    infraLogger.warn({ tenantId }, 'Churn worker: engine desligada (CHURN_ENGINE=off)');
    return;
  }

  infraLogger.info({ tenantId, jobId: job.id }, 'Churn worker: iniciando scoring');

  const customers = await getActiveCustomers(tenantId);

  if (customers.length === 0) {
    infraLogger.info({ tenantId }, 'Churn worker: nenhum cliente ativo encontrado');
    return;
  }

  let scored = 0;
  let errors = 0;

  for (const customer of customers) {
    try {
      const features = await extractFeatures(tenantId, customer.id);
      const { score, riskBand, contributions } = computeChurnScore(features);

      await supabaseAdmin.from('churn_scores').insert({
        tenant_id: tenantId,
        customer_id: customer.id,
        score,
        risk_band: riskBand,
        features,
        contributions, // IA-38: vetor {feature, weight, value, contribution} para waterfall na UI.
        model_version: 'heuristic-v1',
      });

      scored++;
    } catch (err) {
      errors++;
      infraLogger.error({ err, tenantId, customerId: customer.id }, 'Churn worker: erro ao processar cliente');
    }
  }

  infraLogger.info(
    { tenantId, scored, errors, total: customers.length },
    'Churn worker: scoring concluído',
  );
}

/**
 * Cria o worker de churn (repeatable) e agenda o job diário.
 * Retorna null se a engine estiver desligada.
 */
export function createChurnWorker() {
  if (!isChurnEngineEnabled()) {
    infraLogger.warn('Churn worker: engine desligada (CHURN_ENGINE=off). Worker não iniciado.');
    return null;
  }

  const worker = new Worker<ChurnJobData>(
    CHURN_QUEUE,
    processChurnJob,
    {
      connection: connection as any,
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    infraLogger.info({ jobId: job.id, tenantId: job.data.tenantId }, 'Churn job concluído');
  });

  worker.on('failed', (job, err) => {
    infraLogger.error({ jobId: job?.id, err }, 'Churn job falhou');
  });

  return worker;
}

/**
 * Agenda o job de churn para todos os tenants ativos.
 * Chamado uma vez no bootstrap. O repeatable job é por tenant.
 */
export async function scheduleChurnJobs(): Promise<void> {
  if (!isChurnEngineEnabled()) return;

  const queue = new Queue(CHURN_QUEUE, {
    connection: connection as any,
  });

  // Buscar todos os tenants ativos
  const { data: tenants } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('active', true);

  if (!tenants || tenants.length === 0) {
    infraLogger.warn('Churn scheduler: nenhum tenant ativo encontrado');
    return;
  }

  for (const tenant of tenants) {
    await queue.add(
      `churn:${tenant.id}`,
      { tenantId: tenant.id },
      {
        repeat: {
          pattern: '0 3 * * *',
          tz: 'America/Sao_Paulo',
        },
        jobId: `churn-repeat:${tenant.id}`,
      },
    );
  }

  infraLogger.info({ tenantCount: tenants.length }, 'Churn scheduler: jobs diários agendados (03:00 BRT)');
}
