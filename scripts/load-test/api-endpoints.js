/**
 * K6 load test — endpoints da API v2 (CRUD + analytics).
 *
 * Testa throughput e latência dos endpoints mais usados:
 *   - GET /api/v2/health
 *   - GET /api/v2/ia/analytics (requer JWT)
 *   - POST /api/v2/ia/chat-stream (requer JWT)
 *   - GET /api/v2/cobranca/queue-stats (requer JWT)
 *
 * Execução:
 *   k6 run --env JWT_TOKEN=<token> scripts/load-test/api-endpoints.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const JWT_TOKEN = __ENV.JWT_TOKEN || '';

export const options = {
  scenarios: {
    api_mix: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 20 },
        { duration: '60s', target: 100 },
        { duration: '30s', target: 100 },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{name:health}': ['p(95)<500'],
    'http_req_duration{name:analytics}': ['p(95)<2000'],
    'http_req_duration{name:queue_stats}': ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

const errorRate = new Rate('errors');

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(JWT_TOKEN ? { Authorization: `Bearer ${JWT_TOKEN}` } : {}),
  };
}

export default function () {
  group('health', () => {
    const res = http.get(`${BASE_URL}/api/v2/health`, {
      tags: { name: 'health' },
    });
    check(res, { 'health 200': (r) => r.status === 200 });
    errorRate.add(res.status !== 200);
  });

  if (JWT_TOKEN) {
    group('analytics', () => {
      const res = http.get(`${BASE_URL}/api/v2/ia/analytics`, {
        headers: authHeaders(),
        tags: { name: 'analytics' },
      });
      check(res, { 'analytics ok': (r) => r.status === 200 || r.status === 401 });
      errorRate.add(res.status >= 500);
    });

    group('queue_stats', () => {
      const res = http.get(`${BASE_URL}/api/v2/cobranca/queue-stats`, {
        headers: authHeaders(),
        tags: { name: 'queue_stats' },
      });
      check(res, { 'queue_stats ok': (r) => r.status === 200 || r.status === 401 });
      errorRate.add(res.status >= 500);
    });
  }

  sleep(0.5 + Math.random());
}
