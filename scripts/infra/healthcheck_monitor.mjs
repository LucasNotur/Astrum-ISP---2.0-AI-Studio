// healthcheck_monitor.mjs — watchdog do backend Fastify (apps/api).
//
// Rodado a cada 5min pela tarefa agendada "AstrumHealthMonitor" (ver
// scripts/infra/install_healthcheck_monitor.ps1). Não depende de console
// interativo (só fetch() + schtasks/run, ambos funcionam em Sessão 0) —
// diferente de deploy_restart_backend.bat, que precisa de /it por causa do
// timeout.exe. Ver logs/healthcheck.log e astrum-backend-caiu-sem-monitoramento
// na memória do Claude Code pro contexto completo desta decisão.
import 'dotenv/config';
import * as Sentry from '@sentry/node';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.join(ROOT, 'logs');
const STATE_FILE = path.join(LOG_DIR, '.healthcheck_state.json');
const LOG_FILE = path.join(LOG_DIR, 'healthcheck.log');

const LOCAL_HEALTH_URL = 'http://localhost:3001/api/v2/health';
const PUBLIC_HEALTH_URL = 'https://api.astrumlabs.online/api/v2/health';
const RESTART_TASK = 'AstrumBackendRun';
// Duas checagens seguidas (~5-10min) antes de agir — evita falso positivo
// durante o restart normal de um deploy (que resolve em 30-90s, cabe dentro
// de UMA janela de 5min, nunca de duas).
const FAILS_BEFORE_ACTION = 2;
const REALERT_MINUTES = 30;

mkdirSync(LOG_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { writeFileSync(LOG_FILE, line + '\n', { flag: 'a' }); } catch {}
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { consecutiveFails: 0, downSince: null, lastAlertAt: null };
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function checkHealth(url, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryRestart() {
  try {
    execSync(`schtasks /run /tn "${RESTART_TASK}"`, { stdio: 'ignore' });
    return true;
  } catch (err) {
    log(`schtasks /run /tn "${RESTART_TASK}" falhou: ${err.message}`);
    return false;
  }
}

const sentryEnabled = Boolean(process.env.SENTRY_DSN);
if (sentryEnabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'production',
    tracesSampleRate: 0,
  });
}

function alert(message, level, state, extra = {}) {
  log(`[ALERTA ${level}] ${message}`);
  if (!sentryEnabled) return;
  Sentry.captureMessage(message, {
    level,
    fingerprint: ['astrum-backend-down', state.downSince ?? 'unknown'],
    tags: { source: 'healthcheck-monitor' },
    extra,
  });
}

async function main() {
  const state = loadState();
  const localOk = await checkHealth(LOCAL_HEALTH_URL);

  if (localOk) {
    if (state.consecutiveFails > 0) {
      log(`Backend recuperado (estava down desde ${state.downSince}, ${state.consecutiveFails} checagem(ões) com falha).`);
      alert(`Astrum backend voltou ao ar (incidente iniciado ${state.downSince}).`, 'info', state);
    }
    saveState({ consecutiveFails: 0, downSince: null, lastAlertAt: null });
    return;
  }

  state.consecutiveFails = (state.consecutiveFails || 0) + 1;
  if (!state.downSince) state.downSince = new Date().toISOString();
  log(`Health check local falhou (consecutiveFails=${state.consecutiveFails}).`);

  if (state.consecutiveFails < FAILS_BEFORE_ACTION) {
    saveState(state);
    return;
  }

  let selfHealed = false;
  if (state.consecutiveFails === FAILS_BEFORE_ACTION) {
    log('Confirmado: backend fora do ar por 2 checagens seguidas. Tentando self-heal...');
    tryRestart();
    // Histórico real (logs/deploy.log) mostra subidas levando até ~90s —
    // 45s dava falso "self-heal não funcionou" num teste ao vivo (2026-08-23).
    await sleep(90000);
    selfHealed = await checkHealth(LOCAL_HEALTH_URL);
    log(`Self-heal ${selfHealed ? 'funcionou' : 'NÃO funcionou'}.`);
  }

  if (selfHealed) {
    alert(`Astrum backend caiu e foi religado automaticamente (self-heal).`, 'warning', state, {
      consecutiveFails: state.consecutiveFails,
    });
    saveState({ consecutiveFails: 0, downSince: null, lastAlertAt: null });
    return;
  }

  const now = Date.now();
  const lastAlertMs = state.lastAlertAt ? new Date(state.lastAlertAt).getTime() : 0;
  const shouldAlert = state.consecutiveFails === FAILS_BEFORE_ACTION || (now - lastAlertMs) >= REALERT_MINUTES * 60_000;

  if (shouldAlert) {
    const publicOk = await checkHealth(PUBLIC_HEALTH_URL);
    alert(`Astrum backend FORA DO AR desde ${state.downSince} — self-heal não funcionou.`, 'error', state, {
      consecutiveFails: state.consecutiveFails,
      publicTunnelOk: publicOk,
    });
    state.lastAlertAt = new Date().toISOString();
  }

  saveState(state);
}

main()
  .catch((err) => log(`Erro inesperado no monitor: ${err?.stack || err}`))
  .finally(async () => {
    if (sentryEnabled) await Sentry.flush(2000).catch(() => {});
    process.exit(0);
  });
