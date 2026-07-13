/**
 * Prova de fogo E-01 + D-04 no tenant demo LOCAL (Supabase local, nunca produção).
 * Injeta um client apontado para 127.0.0.1 nos ports dos serviços.
 *
 * Uso: npx tsx scripts/seed/run-brain-demo.ts
 */
import { createClient } from '@supabase/supabase-js';
import { DEMO_TENANT_ID } from './seed-demo-tenant';
import { scanForIncidents, transitionIncident, communicateIncident } from '../../apps/api/src/domain/rede/incident-orchestrator.service';
import { runNightlyReflection } from '../../apps/api/src/domain/ia/nightly-brain/nightly-brain.service';

const LOCAL_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321';
// Chave local: `npx supabase status` → SECRET_KEY. Nunca commitar chave literal
// (o push protection do GitHub bloqueia até a chave demo padrão do CLI).
const LOCAL_KEY = process.env.SUPABASE_LOCAL_SECRET ?? '';
if (!LOCAL_KEY) {
  console.error('Defina SUPABASE_LOCAL_SECRET (npx supabase status → SECRET_KEY).');
  process.exit(1);
}

const db = createClient(LOCAL_URL, LOCAL_KEY) as any;

async function main() {
  console.log('— D-04: varrendo telemetria do ISP Demo Astrolândia…');
  const scan = await scanForIncidents(DEMO_TENANT_ID, { db });
  console.log(`  CTOs anômalas: ${scan.anomalousCtos.length} · incidentes abertos: ${scan.opened}`);

  const { data: incidents } = await db
    .from('incidents').select('id, status, severity, title, cto_id')
    .eq('tenant_id', DEMO_TENANT_ID).eq('status', 'suspeita');

  for (const inc of incidents ?? []) {
    await transitionIncident(DEMO_TENANT_ID, inc.id, 'confirmada', { db });
    const r = await communicateIncident(DEMO_TENANT_ID, inc.id, undefined, { db });
    console.log(`  incidente ${inc.id.slice(0, 8)}: confirmado → comunicado (${r.customerCount} clientes avisados)`);
  }

  console.log('— E-01: rodando a reflexão noturna de ontem…');
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const reflection = await runNightlyReflection(
    DEMO_TENANT_ID, yesterday, { db, refineLlm: null },
    scan.anomalousCtos.map((ctoId) => ({ ctoId, metric: 'latency_ms' })),
  );

  console.log(`  métricas: tickets=${reflection.metrics.ticketsTotal} · escalação=${(reflection.metrics.escalationRate * 100).toFixed(0)}% · custo=US$${reflection.metrics.aiCostUsd} · candidatos KB=${reflection.metrics.kbDraftCandidates}`);
  console.log('  o que a Astrum pensou esta noite:');
  for (const h of reflection.hypotheses) console.log(`   [${h.severity}] ${h.code}: ${h.text}`);
  for (const a of reflection.actions) console.log(`   → ação sugerida: ${a.type} — ${a.detail}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌', e.message); process.exit(1); });
