// k6 load test — GET /v1/members?phone= @ 500 RPS for 60s
// Run with: k6 run tests/load-test.js
// NOT executed in CI — k6 binary not guaranteed in this environment.
//
// Target: p99 < 100ms (per T-04 spec).

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TENANT_ID = __ENV.TENANT_ID || '11111111-1111-1111-1111-111111111111';
const USER_ID = __ENV.USER_ID || 'load-test-user';
const PHONE = __ENV.PHONE || '+14155551212';

export const options = {
  scenarios: {
    pos_lookup: {
      executor: 'constant-arrival-rate',
      rate: 500, // 500 RPS
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 100,
      maxVUs: 500,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // < 1% error rate
    http_req_duration: ['p(99)<100'], // p99 < 100ms
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/v1/members?phone=${encodeURIComponent(PHONE)}`, {
    headers: {
      'x-tenant-id': TENANT_ID,
      'x-user-id': USER_ID,
      'content-type': 'application/json',
    },
    tags: { endpoint: 'members_lookup_phone' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has tierName': (r) => {
      try {
        return typeof r.json('tierName') === 'string';
      } catch (_e) {
        return false;
      }
    },
  });
}
