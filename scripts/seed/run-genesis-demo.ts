/**
 * PROVA DE FOGO D-23 — o botão "Análise Completa WhatsApp Engine" no demo local.
 * Uso: SUPABASE_LOCAL_SECRET=<npx supabase status → SECRET_KEY> npx tsx scripts/seed/run-genesis-demo.ts
 */
import { createClient } from '@supabase/supabase-js';
import { DEMO_TENANT_ID } from './seed-demo-tenant';
import { runRetroAnalysis } from '../../apps/api/src/domain/atendimento/whatsapp-retro.service';

const LOCAL_KEY = process.env.SUPABASE_LOCAL_SECRET ?? '';
if (!LOCAL_KEY) { console.error('Defina SUPABASE_LOCAL_SECRET.'); process.exit(1); }
const db = createClient(process.env.SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321', LOCAL_KEY) as any;

async function main() {
  console.log('🧬 D-23 — GÊNESIS ENGINE: "Análise Completa WhatsApp Engine"…\n');
  const r = await runRetroAnalysis(DEMO_TENANT_ID, { db });
  console.log(`   Contatos analisados: ${r.contactsAnalyzed} · perfis gravados: ${r.profilesWritten}`);
  console.log(`   Pagadores: ${r.payerMix.pontual} pontuais · ${r.payerMix.atrasa} atrasam · ${r.payerMix.inadimplente} inadimplentes · ${r.payerMix.sem_historico} sem histórico`);
  console.log(`   Estilos: ${r.styleMix.coloquial} coloquiais · ${r.styleMix.formal} formais · ${r.styleMix.tecnico} técnicos`);
  console.log(`   Top problemas: ${r.topIssuesGlobal.map((i) => `${i.issue} (${i.count})`).join(' · ')}`);
  console.log(`\n   📣 ${r.headline}`);

  // Confere que o perfil realmente foi gravado no cliente
  const { data: sample } = await db
    .from('customers').select('name, extra')
    .eq('tenant_id', DEMO_TENANT_ID).not('extra->retro_profile', 'is', null).limit(1);
  const p = sample?.[0]?.extra?.retro_profile;
  if (p) console.log(`\n   Exemplo — ${sample[0].name}: fala ${p.commStyle}, paga "${p.payerType}", problema nº1: ${p.topIssues[0]?.issue ?? '—'}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌', e.message); process.exit(1); });
