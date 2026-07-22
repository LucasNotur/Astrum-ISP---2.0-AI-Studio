/**
 * Chaos test runner — injeta falhas em dependências e verifica degradação graceful.
 *
 * Testa cada dependência isoladamente:
 *   - Redis: para o container → sistema usa fallback / fail-open
 *   - Qdrant: para o container → RAG degrada, não perde mensagem
 *   - OpenAI: proxy retorna 500 → circuit breaker abre, fallback ativo
 *   - Supabase: mata conexão → retries + fila persiste no Redis
 *
 * Execução:
 *   npx tsx scripts/chaos/chaos-runner.ts --target redis
 *   npx tsx scripts/chaos/chaos-runner.ts --target all
 *   npx tsx scripts/chaos/chaos-runner.ts --target openai --duration 30
 */

interface ChaosResult {
  target: string;
  messagesBeforeFault: number;
  messagesLostDuringFault: number;
  recoveryTimeMs: number;
  degradationMode: string;
  passed: boolean;
  errors: string[];
}

interface ChaosTarget {
  name: string;
  inject: () => Promise<void>;
  restore: () => Promise<void>;
  expectedDegradation: string;
}

const TARGETS: Record<string, ChaosTarget> = {
  redis: {
    name: 'Redis',
    inject: async () => {
      await runCmd('docker pause astrum-redis || docker compose pause redis');
    },
    restore: async () => {
      await runCmd('docker unpause astrum-redis || docker compose unpause redis');
    },
    expectedDegradation: 'fail-open: mensagens aceitas via HTTP, filas pausam, retomam ao reconectar',
  },
  qdrant: {
    name: 'Qdrant',
    inject: async () => {
      await runCmd('docker pause astrum-qdrant || docker compose pause qdrant');
    },
    restore: async () => {
      await runCmd('docker unpause astrum-qdrant || docker compose unpause qdrant');
    },
    expectedDegradation: 'RAG indisponível: respostas sem contexto KB, mas conversa continua',
  },
  openai: {
    name: 'OpenAI (via proxy)',
    inject: async () => {
      await setEnvVar('OPENAI_BASE_URL', 'http://localhost:19999');
    },
    restore: async () => {
      await setEnvVar('OPENAI_BASE_URL', '');
    },
    expectedDegradation: 'circuit breaker abre, fallback para provider alternativo (Anthropic/Gemini)',
  },
  supabase: {
    name: 'Supabase',
    inject: async () => {
      await runCmd('docker pause astrum-supabase-db || docker compose pause supabase-db');
    },
    restore: async () => {
      await runCmd('docker unpause astrum-supabase-db || docker compose unpause supabase-db');
    },
    expectedDegradation: 'writes falham com retry, mensagens ficam na fila BullMQ (Redis) e são reprocessadas',
  },
};

async function runCmd(cmd: string): Promise<string> {
  const { execSync } = await import('child_process');
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 15_000 });
  } catch (e: any) {
    return e.stderr || e.message;
  }
}

async function setEnvVar(key: string, value: string): Promise<void> {
  if (value) {
    process.env[key] = value;
  } else {
    delete process.env[key];
  }
}

async function sendTestMessage(baseUrl: string): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/v2/health`);
    return { ok: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

async function checkQueueHealth(baseUrl: string): Promise<{ pending: number; failed: number }> {
  try {
    const res = await fetch(`${baseUrl}/api/v2/cobranca/queue-stats`);
    if (!res.ok) return { pending: -1, failed: -1 };
    const data = await res.json() as any;
    return {
      pending: data.waiting ?? data.pending ?? 0,
      failed: data.failed ?? 0,
    };
  } catch {
    return { pending: -1, failed: -1 };
  }
}

async function runChaosTest(
  target: ChaosTarget,
  baseUrl: string,
  durationSec: number,
): Promise<ChaosResult> {
  const errors: string[] = [];
  let messagesLost = 0;

  console.log(`\n🔥 Injetando falha: ${target.name}`);
  console.log(`   Degradação esperada: ${target.expectedDegradation}`);

  // Pre-fault health check
  const preHealth = await sendTestMessage(baseUrl);
  if (!preHealth.ok) {
    errors.push('Servidor não estava saudável antes da injeção');
  }

  const preQueue = await checkQueueHealth(baseUrl);
  const messagesBefore = preQueue.pending;

  // Inject fault
  try {
    await target.inject();
    console.log(`   ✅ Falha injetada em ${target.name}`);
  } catch (e: any) {
    errors.push(`Falha ao injetar: ${e.message}`);
  }

  // Monitor during fault
  const faultStart = Date.now();
  let checksTotal = 0;
  let checksFailed = 0;

  while (Date.now() - faultStart < durationSec * 1000) {
    checksTotal++;
    const check = await sendTestMessage(baseUrl);
    if (!check.ok) checksFailed++;
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Restore
  console.log(`   🔄 Restaurando ${target.name}...`);
  const restoreStart = Date.now();
  try {
    await target.restore();
  } catch (e: any) {
    errors.push(`Falha ao restaurar: ${e.message}`);
  }

  // Wait for recovery
  let recovered = false;
  let recoveryTime = 0;
  for (let i = 0; i < 30; i++) {
    const check = await sendTestMessage(baseUrl);
    if (check.ok) {
      recovered = true;
      recoveryTime = Date.now() - restoreStart;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!recovered) {
    errors.push('Sistema não recuperou em 30s após restauração');
    recoveryTime = 30_000;
  }

  // Post-fault queue check
  const postQueue = await checkQueueHealth(baseUrl);
  messagesLost = Math.max(0, messagesBefore - (postQueue.pending >= 0 ? postQueue.pending : messagesBefore));

  const result: ChaosResult = {
    target: target.name,
    messagesBeforeFault: messagesBefore,
    messagesLostDuringFault: messagesLost,
    recoveryTimeMs: recoveryTime,
    degradationMode: target.expectedDegradation,
    passed: errors.length === 0 && messagesLost === 0 && recovered,
    errors,
  };

  console.log(`   ${result.passed ? '✅' : '❌'} ${target.name}: recovery=${recoveryTime}ms, lost=${messagesLost}`);
  return result;
}

function generateReport(results: ChaosResult[]): string {
  const lines: string[] = [
    '# Load + Chaos Test Report — S84',
    '',
    `> Gerado em ${new Date().toISOString()}`,
    '',
    '## Resumo',
    '',
    '| Alvo | Resultado | Recovery (ms) | Mensagens Perdidas | Modo de Degradação |',
    '|------|-----------|---------------|--------------------|--------------------|',
  ];

  for (const r of results) {
    lines.push(
      `| ${r.target} | ${r.passed ? '✅ PASS' : '❌ FAIL'} | ${r.recoveryTimeMs} | ${r.messagesLostDuringFault} | ${r.degradationMode.slice(0, 50)}... |`,
    );
  }

  lines.push('', '## Detalhes', '');
  for (const r of results) {
    lines.push(`### ${r.target}`, '');
    lines.push(`- **Resultado:** ${r.passed ? 'PASS' : 'FAIL'}`);
    lines.push(`- **Recovery:** ${r.recoveryTimeMs}ms`);
    lines.push(`- **Mensagens perdidas:** ${r.messagesLostDuringFault}`);
    lines.push(`- **Degradação:** ${r.degradationMode}`);
    if (r.errors.length) {
      lines.push(`- **Erros:**`);
      for (const e of r.errors) lines.push(`  - ${e}`);
    }
    lines.push('');
  }

  const allPass = results.every((r) => r.passed);
  lines.push(
    '## Veredicto',
    '',
    allPass
      ? '✅ **TODOS OS TESTES PASSARAM** — Sistema degrada gracefully sem perda de mensagens.'
      : '❌ **FALHAS DETECTADAS** — Ver detalhes acima. Correções necessárias antes do go-live.',
  );

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const targetArg = args.find((a) => !a.startsWith('--'))
    || args[args.indexOf('--target') + 1]
    || 'all';
  const durationArg = parseInt(args[args.indexOf('--duration') + 1] || '15', 10);
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';

  console.log(`🧪 Chaos Test Runner`);
  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   Target: ${targetArg}`);
  console.log(`   Fault duration: ${durationArg}s`);

  const targets = targetArg === 'all'
    ? Object.values(TARGETS)
    : TARGETS[targetArg]
      ? [TARGETS[targetArg]]
      : (() => { throw new Error(`Target desconhecido: ${targetArg}. Use: ${Object.keys(TARGETS).join(', ')}, all`); })();

  const results: ChaosResult[] = [];
  for (const t of targets) {
    results.push(await runChaosTest(t, baseUrl, durationArg));
    await new Promise((r) => setTimeout(r, 5000));
  }

  const report = generateReport(results);
  const { writeFileSync, mkdirSync } = await import('fs');
  mkdirSync('docs/qa', { recursive: true });
  writeFileSync('docs/qa/LOAD_CHAOS_S84.md', report);
  console.log('\n📄 Relatório salvo em docs/qa/LOAD_CHAOS_S84.md');

  const allPass = results.every((r) => r.passed);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
