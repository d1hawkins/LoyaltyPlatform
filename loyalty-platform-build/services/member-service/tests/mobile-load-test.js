/**
 * k6 load test for the Mobile Dashboard endpoint.
 *
 * Target: 300 RPS with p99 < 200ms.
 *
 * Usage:
 *   k6 run services/member-service/tests/mobile-load-test.js \
 *     --env BASE_URL=http://localhost:3001 \
 *     --env TENANT_ID=11111111-1111-1111-1111-111111111111 \
 *     --env MEMBER_ID=22222222-2222-2222-2222-222222222222
 *
 * This script exercises the aggregated dashboard endpoint which is the most
 * performance-sensitive mobile endpoint. It validates that the Redis-cached
 * response path keeps p99 latency under 200ms at 300 RPS sustained for 60s.
 *
 * NOTE: Script only — not executed in the build environment (no k6 binary).
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TENANT_ID = __ENV.TENANT_ID || '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = __ENV.MEMBER_ID || '22222222-2222-2222-2222-222222222222';

export const options = {
  scenarios: {
    dashboard_load: {
      executor: 'constant-arrival-rate',
      rate: 300,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_duration: [
      { threshold: 'p(99)<200', abortOnFail: true },
      { threshold: 'p(95)<100', abortOnFail: false },
      { threshold: 'avg<50', abortOnFail: false },
    ],
    http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true }],
  },
};

export default function () {
  const params = {
    headers: {
      'x-tenant-id': TENANT_ID,
      'x-user-id': 'load-test-user',
      'Content-Type': 'application/json',
    },
    tags: { endpoint: 'mobile_dashboard' },
  };

  // Primary test: aggregated dashboard endpoint
  const dashRes = http.get(
    `${BASE_URL}/v1/mobile/dashboard/${MEMBER_ID}`,
    params,
  );

  check(dashRes, {
    'dashboard: status 200': (r) => r.status === 200,
    'dashboard: has member': (r) => {
      const body = JSON.parse(r.body);
      return body.member && body.member.id === MEMBER_ID;
    },
    'dashboard: has balance': (r) => {
      const body = JSON.parse(r.body);
      return typeof body.balance === 'number';
    },
    'dashboard: has tierProgress': (r) => {
      const body = JSON.parse(r.body);
      return body.tierProgress && body.tierProgress.current;
    },
  });

  // Occasional calls to other mobile endpoints (10% of iterations)
  if (Math.random() < 0.1) {
    const txnRes = http.get(
      `${BASE_URL}/v1/mobile/transactions/${MEMBER_ID}?limit=5`,
      params,
    );
    check(txnRes, {
      'transactions: status 200': (r) => r.status === 200,
    });
  }

  if (Math.random() < 0.1) {
    const tierRes = http.get(
      `${BASE_URL}/v1/mobile/tier-progress/${MEMBER_ID}`,
      params,
    );
    check(tierRes, {
      'tier-progress: status 200': (r) => r.status === 200,
    });
  }
}

export function handleSummary(data) {
  const p99 = data.metrics.http_req_duration.values['p(99)'];
  const p95 = data.metrics.http_req_duration.values['p(95)'];
  const avg = data.metrics.http_req_duration.values.avg;
  const failRate = data.metrics.http_req_failed.values.rate;

  return {
    stdout: `
=== Mobile Dashboard Load Test Results ===
  Duration p99: ${p99.toFixed(2)}ms (target: <200ms) ${p99 < 200 ? 'PASS' : 'FAIL'}
  Duration p95: ${p95.toFixed(2)}ms (target: <100ms) ${p95 < 100 ? 'PASS' : 'WARN'}
  Duration avg: ${avg.toFixed(2)}ms (target: <50ms) ${avg < 50 ? 'PASS' : 'WARN'}
  Error rate:   ${(failRate * 100).toFixed(2)}% (target: <1%) ${failRate < 0.01 ? 'PASS' : 'FAIL'}
==========================================
`,
  };
}
