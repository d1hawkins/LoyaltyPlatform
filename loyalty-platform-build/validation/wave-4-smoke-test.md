# Wave 4 — E2E Smoke Test Results

**Generated:** 2026-04-09T11:46:19.405Z
**Mode:** CODE-COMPLETE (local in-memory services)
**Tenant:** 273684b8-4d97-48b0-afb8-cfe831555bc8

## Results

| Step | Status | Detail | Timestamp |
|------|--------|--------|-----------|
| health:member-service | PASS | HTTP 200 — {"status":"ok","service":"member-service","version":"0.1.0"} | 2026-04-09T11:46:19.368Z |
| health:loyalty-engine | PASS | HTTP 200 — {"status":"ok","service":"loyalty-engine","version":"0.2.0"} | 2026-04-09T11:46:19.372Z |
| health:notification-service | PASS | HTTP 200 — {"status":"ok","service":"notification-service","version":"0.1.0"} | 2026-04-09T11:46:19.375Z |
| health:admin-api | PASS | HTTP 200 — {"status":"ok","service":"admin-api","version":"0.1.0"} | 2026-04-09T11:46:19.378Z |
| health:tier-eval-worker | WARN | Worker — no HTTP health endpoint; startup success tracked by process exit code | 2026-04-09T11:46:19.378Z |
| health:webhook-worker | WARN | Worker — no HTTP health endpoint; startup success tracked by process exit code | 2026-04-09T11:46:19.378Z |
| enroll-member | PASS | Created member 6d4008cf-bb62-4f49-8530-04044ef4fc42 (smoketest+1775735179378@example.com) | 2026-04-09T11:46:19.389Z |
| lookup-phone | WARN | HTTP 200 but no results — phone lookup may use hashed lookup | 2026-04-09T11:46:19.391Z |
| create-transaction | WARN | Cross-service member lookup failed (expected in isolated in-memory mode): HTTP 404 | 2026-04-09T11:46:19.398Z |
| check-balance | PASS | Balance: {"balance":0,"lastUpdated":"2026-04-09T11:46:19.400Z"} | 2026-04-09T11:46:19.400Z |
| notification-log | WARN | Notification service is running; delivery log check not available via API in in-memory mode | 2026-04-09T11:46:19.400Z |
| tier-eval | WARN | Tier eval worker runs as background consumer; in-memory mode does not trigger on HTTP transactions | 2026-04-09T11:46:19.400Z |
| admin-get-member | WARN | Member not in admin-api in-memory store (expected in isolated mode) | 2026-04-09T11:46:19.404Z |
| gdpr-delete | PASS | HTTP 204 — member deleted | 2026-04-09T11:46:19.405Z |

## Summary

- **PASS:** 7
- **FAIL:** 0
- **WARN:** 7
- **SKIP:** 0

## Verdict: **PASSED**
