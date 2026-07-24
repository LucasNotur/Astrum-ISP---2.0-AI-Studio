/**
 * K6 load test — 1000 mensagens simultâneas no webhook Evolution v2.
 *
 * Pré-requisitos:
 *   - k6 instalado (https://k6.io)
 *   - Servidor Fastify rodando em BASE_URL
 *   - HMAC_SECRET definido (mesmo da env do servidor)
 *
 * Execução:
 *   k6 run scripts/load-test/webhook-stress.js
 *   k6 run --vus 200 --duration 60s scripts/load-test/webhook-stress.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import crypto from 'k6/crypto';

// ─── Config ─────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const HMAC_SECRET = __ENV.HMAC_SECRET || 'test-hmac-secret';
const TENANT_ID = __ENV.TENANT_ID || 'tenant-load-test';
const INSTANCE_NAME = __ENV.INSTANCE_NAME || 'load-test-instance';

export const options = {
  scenarios: {
    burst: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 1000,
      maxDuration: '120s',
    },
    sustained: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '60s', target: 200 },
        { duration: '30s', target: 200 },
        { duration: '20s', target: 0 },
      ],
      startTime: '130s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
    webhook_accepted: ['rate>0.99'],
    jobs_enqueued: ['count>=990'],
  },
};

// ─── Custom metrics ─────────────────────────────────────────────────
const webhookAccepted = new Rate('webhook_accepted');
const jobsEnqueued = new Counter('jobs_enqueued');
const webhookLatency = new Trend('webhook_latency', true);

// ─── Payload templates ─────────────────────────────────────────────
const messageTypes = new SharedArray('types', () => [
  'text',
  'audio',
  'image',
  'document',
]);

function generatePayload(vuId, iter) {
  const msgType = messageTypes[iter % messageTypes.length];
  const phone = `5511${String(90000000 + iter).padStart(9, '0')}`;
  const msgId = `K6_${vuId}_${iter}_${Date.now()}`;

  const base = {
    event: 'messages.upsert',
    instance: INSTANCE_NAME,
    data: {
      key: {
        remoteJid: `${phone}@s.whatsapp.net`,
        fromMe: false,
        id: msgId,
      },
      pushName: `Load Test User ${iter}`,
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };

  switch (msgType) {
    case 'audio':
      base.data.message = {
        audioMessage: {
          url: `https://example.com/audio/${msgId}.ogg`,
          mimetype: 'audio/ogg; codecs=opus',
        },
      };
      break;
    case 'image':
      base.data.message = {
        imageMessage: {
          url: `https://example.com/img/${msgId}.jpg`,
          mimetype: 'image/jpeg',
          caption: `Imagem de teste ${iter}`,
        },
      };
      break;
    case 'document':
      base.data.message = {
        documentMessage: {
          url: `https://example.com/doc/${msgId}.pdf`,
          mimetype: 'application/pdf',
          fileName: `teste_${iter}.pdf`,
        },
      };
      break;
    default:
      base.data.message = {
        conversation: `Mensagem de teste K6 #${iter} — meu link está caindo, o que eu faço?`,
      };
  }

  return base;
}

function signPayload(body) {
  const hmac = crypto.createHMAC('sha256', HMAC_SECRET);
  hmac.update(body);
  return hmac.hexDigest();
}

// ─── Main VU ────────────────────────────────────────────────────────
export default function () {
  const payload = generatePayload(__VU, __ITER);
  const body = JSON.stringify(payload);
  const signature = signPayload(body);

  const res = http.post(
    `${BASE_URL}/api/v2/webhook/evolution`,
    body,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': signature,
      },
      tags: { name: 'webhook_evolution' },
    },
  );

  const accepted = check(res, {
    'status 200 or 202': (r) => r.status === 200 || r.status === 202,
    'body has jobId or ok': (r) => {
      try {
        const b = JSON.parse(r.body);
        return b.jobId || b.status === 'ok' || b.queued;
      } catch {
        return false;
      }
    },
  });

  webhookAccepted.add(accepted);
  if (accepted) jobsEnqueued.add(1);
  webhookLatency.add(res.timings.duration);

  sleep(0.05 + Math.random() * 0.1);
}

// ─── Health check before test ───────────────────────────────────────
export function setup() {
  const health = http.get(`${BASE_URL}/api/v2/health`);
  check(health, {
    'server healthy': (r) => r.status === 200,
  });

  if (health.status !== 200) {
    throw new Error(`Servidor não está saudável: ${health.status}`);
  }

  const body = JSON.parse(health.body);
  console.log(`Server status: ${JSON.stringify(body.services)}`);
  return { startTime: Date.now() };
}

// ─── Summary ────────────────────────────────────────────────────────
export function teardown(data) {
  const elapsed = (Date.now() - data.startTime) / 1000;
  console.log(`\n=== LOAD TEST COMPLETE ===`);
  console.log(`Duration: ${elapsed.toFixed(1)}s`);
  console.log(`Target: p95 < 1500ms, failure rate < 1%, zero job loss`);
}
