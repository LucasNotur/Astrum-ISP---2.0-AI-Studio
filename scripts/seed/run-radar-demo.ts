/**
 * PROVA DE FOGO D-01 + D-02 + D-08 no tenant demo local — e, ao mesmo tempo,
 * O ROTEIRO DA DEMO DE VENDA: a história que o Radar conta para um prospect
 * ("olha o que a Astrum vê no SEU provedor em 5 minutos").
 *
 * Uso: SUPABASE_LOCAL_SECRET=<npx supabase status → SECRET_KEY> npx tsx scripts/seed/run-radar-demo.ts
 */
import { createClient } from '@supabase/supabase-js';
import { DEMO_TENANT_ID } from './seed-demo-tenant';
import { backtestPolicy } from '../../apps/api/src/domain/cobranca/policy-backtest.service';
import { simulateCtoFailure, simulateGrowth } from '../../apps/api/src/domain/rede/network-twin.service';
import { forecastCashflow } from '../../apps/api/src/domain/financeiro/cashflow-forecast.service';

const LOCAL_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321';
const LOCAL_KEY = process.env.SUPABASE_LOCAL_SECRET ?? '';
if (!LOCAL_KEY) {
  console.error('Defina SUPABASE_LOCAL_SECRET (npx supabase status → SECRET_KEY).');
  process.exit(1);
}
const db = createClient(LOCAL_URL, LOCAL_KEY) as any;
const reais = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

async function main() {
  console.log('════════ O RADAR DA ASTRUM — ISP Demo Astrolândia (500 assinantes) ════════\n');

  // ── D-08: o CFO virtual abre a conversa ────────────────────────────────────
  console.log('💰 D-08 — CFO VIRTUAL (o caixa dos próximos 90 dias):');
  const cash = await forecastCashflow(DEMO_TENANT_ID, {}, db);
  console.log(`   ${cash.headline}`);
  console.log(`   Comportamento observado: ${(cash.observed.onTimeRate * 100).toFixed(0)}% pagam em dia · ${(cash.observed.lateRecoveryRate * 100).toFixed(0)}% com atraso · ${(cash.observed.lossRate * 100).toFixed(0)}% perdidos\n`);

  // ── D-02: quanto uma régua melhor recupera ─────────────────────────────────
  console.log('📈 D-02 — BACKTESTING DE RÉGUA (política nova × SEU histórico):');
  const bt = await backtestPolicy(DEMO_TENANT_ID, {
    reminderDaysBefore: 3,
    remindersAfterDue: [3, 7, 15],
    settlementDiscountPct: 10,
    primaryChannel: 'whatsapp',
  }, {}, db);
  console.log(`   Inadimplência na janela: ${reais(bt.baseline.unpaidCents)} (${bt.baseline.invoicesTotal} faturas analisadas)`);
  console.log(`   Ganho projetado da régua nova: ${reais(bt.projectedGainCents.pessimista)} (pessimista) · ${reais(bt.projectedGainCents.base)} (base) · ${reais(bt.projectedGainCents.otimista)} (otimista)`);
  console.log(`   ${bt.disclaimer}\n`);

  // ── D-01: o gêmeo digital mostra o risco físico ────────────────────────────
  console.log('🗺️  D-01 — GÊMEO DIGITAL (se a pior CTO cair agora):');
  const { data: ctos } = await db
    .from('network_ctos').select('id, name, used_ports')
    .eq('tenant_id', DEMO_TENANT_ID).order('used_ports', { ascending: false }).limit(1);
  const worst = ctos![0]!;
  const fail = await simulateCtoFailure(DEMO_TENANT_ID, worst.id, { db });
  console.log(`   ${fail.cto.name}: ${fail.affectedCustomers} clientes no escuro · ${reais(fail.mrrAtRiskCents)}/mês em risco · ~${fail.predictedTickets} tickets na 1ª hora`);
  console.log(`   Realocação: ${fail.reallocation.slice(0, 2).map((n) => `${n.name} (${n.freePorts} portas a ${n.distanceKm}km)`).join(' → ')}${fail.strandedCustomers ? ` · ${fail.strandedCustomers} SEM porta` : ' · todos realocáveis'}\n`);

  console.log('🏗️  D-01 — GÊMEO DIGITAL (crescer 30 clientes na mesma região):');
  const growth = await simulateGrowth(DEMO_TENANT_ID, worst.id, 30, null, { db });
  console.log(`   ${growth.targetCto.name} absorve ${growth.absorbed} · transbordo ${growth.newCustomers - growth.absorbed - growth.overflow} p/ vizinhas · ${growth.overflow} sem porta ${growth.capexNeeded ? '→ CAPEX ANTES da campanha' : ''}`);
  console.log(`   MRR do crescimento: +${reais(growth.projectedMrrGainCents)}/mês\n`);

  console.log('════════ Fim do Radar. Preço disso tudo: R$ 2,50 × assinante. ════════');
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌', e.message); process.exit(1); });
