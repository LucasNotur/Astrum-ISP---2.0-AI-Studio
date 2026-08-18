/**
 * Smoke-test do replay engine (IA-46) sem depender do worker BullMQ da fila
 * `astrum-replay` (que ainda não tem consumidor — POST /api/v2/ia/replay hoje
 * fica em `queued` pra sempre, ver PLANO_MIGRACAO_EXPRESS_FASTIFY.md). Chama
 * `executeReplayRun` direto, contra dados reais de `messages` do tenant.
 *
 * Uso: npx tsx -r dotenv/config scripts/replay/run-replay-smoke.ts
 * (o `-r dotenv/config` é obrigatório — sem ele as env vars do .env não
 * carregam antes dos imports resolverem, e tudo falha com "credenciais ausentes").
 */
import { supabaseAdmin } from '../../apps/api/src/infrastructure/database/supabase.client';
import { executeReplayRun } from '../../apps/api/src/domain/atendimento/replay.service';

async function main() {
  const tenantId = '11111111-1111-1111-1111-111111111111'; // Astrum Telecom (tem mensagens reais)

  const { data: run, error } = await supabaseAdmin
    .from('replay_runs')
    .insert({
      tenant_id: tenantId,
      params: { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T23:59:59.999Z', sample: 20 },
      status: 'queued',
    })
    .select('id')
    .single();

  if (error || !run) {
    console.error('Falha ao criar replay_runs:', error);
    process.exit(1);
  }

  const runId = (run as { id: string }).id;
  console.log('Replay run criada:', runId, '— executando...');

  await executeReplayRun(runId);

  const { data: result, error: resErr } = await supabaseAdmin
    .from('replay_runs')
    .select('status, total, equivalent, pass_rate')
    .eq('id', runId)
    .single();

  if (resErr) {
    console.error('Falha ao ler resultado:', resErr);
    process.exit(1);
  }

  console.log('RESULTADO:', JSON.stringify(result, null, 2));

  const { data: items } = await supabaseAdmin
    .from('replay_items')
    .select('verdict, user_message, original_response, candidate_response, judge_rationale')
    .eq('run_id', runId);

  console.log('ITENS:', JSON.stringify(items, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('ERRO FATAL:', err);
  process.exit(1);
});
