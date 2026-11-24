import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.PC_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
const TENANT_SLUG = __ENV.PC_TENANT_SLUG ?? 'demo';
const ACCESS_TOKEN = __ENV.PC_ACCESS_TOKEN ?? '';

if (!ACCESS_TOKEN) {
  throw new Error('PC_ACCESS_TOKEN is required');
}

export const options = {
  scenarios: {
    employee_list: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  thresholds: {
    'http_req_duration{endpoint:employee_list}': ['p(95)<400'],
    'http_req_failed{endpoint:employee_list}': ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const response = http.get(`${BASE_URL}/employees?page=1&pageSize=20`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'X-Tenant-Slug': TENANT_SLUG,
    },
    tags: { endpoint: 'employee_list' },
  });

  check(response, {
    'employee list returns 200': (candidate) => candidate.status === 200,
    'employee list has envelope': (candidate) => {
      const body = JSON.parse(candidate.body ?? '{}');
      return Array.isArray(body.data) && Boolean(body.meta);
    },
  });

  sleep(0.1);
}
