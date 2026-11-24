# 14 — Event-Driven Architecture

Design follows the PDF's outbox requirement `[REF]` and the brief's BullMQ/idempotency requirements `[BRIEF]`. No fire-and-forget publishing.

## 1. Transactional outbox

```ts
await prisma.$transaction(async (tx) => {
  const employee = await tx.employee.update({ where: { id, version }, data: {...} });
  await tx.employmentHistory.create({ data: {...} });
  await tx.auditEvent.create({ data: {...} });
  await tx.domainEventOutbox.create({
    data: {
      eventId: randomUUID(),
      eventType: 'employee.status_changed',
      aggregateType: 'employee',
      aggregateId: employee.id,
      payload: { employeeId: employee.id, from, to, tenantId: ctx.tenantId },
      headers: { requestId: ctx.requestId, correlationId: ctx.correlationId },
      status: 'pending',
      availableAt: new Date(),
    },
  });
});
```

Rules:

- Business row + audit row + outbox row commit atomically. If the commit fails, no event exists.
- Event payloads contain opaque IDs and non-sensitive state only; no PII, secrets, or salary values `[ASSUMPTION]`.
- `eventId` is the idempotency key for both publishing and consumers.
- Outbox rows are never physically deleted during P0/P1; a retention job archives/published rows later.

## 2. Publisher

A dedicated BullMQ repeatable job (`outbox-dispatch`, every 1 s) runs a SQL claim:

```sql
SELECT * FROM domain_event_outbox
WHERE status = 'pending' AND available_at <= now()
ORDER BY available_at, id
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

1. Claim rows, mark `pending → publishing` (internal state) with `attempts++`.
2. For each row, `queue.add(eventType, payload, { jobId: eventId, attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: false })`.
3. Worker success → outbox `status='published'`, `published_at=now()`. Failure → `status='failed'` with `last_error`; after max attempts → `status='dead'` + DLQ alert.
4. Publisher is idempotent: `jobId = eventId` means duplicate enqueues are deduplicated by BullMQ.
5. Crash recovery: claimed rows older than 60 s with status `publishing` are reset to `pending` by a reconciler.

## 3. Event catalogue

| Event                                                                                                                                                                           | Producer               | Consumers (phase)                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------- |
| `tenant.created`, `tenant.status_changed`                                                                                                                                       | Tenancy                | Audit, provisioning (P7)                                          |
| `user.created`, `user.logged_in`, `user.disabled`                                                                                                                               | Auth                   | Audit, Notifications                                              |
| `role.changed`, `user_roles.changed`                                                                                                                                            | RBAC                   | Cache invalidation, Audit                                         |
| `employee.created` `[REF]`                                                                                                                                                      | Employees              | Onboarding (P4), Reporting (P7), Audit                            |
| `employee.updated`                                                                                                                                                              | Employees              | Reporting, Search projection                                      |
| `employee.status_changed` `[REF]`                                                                                                                                               | Employees              | Onboarding/Offboarding, Payroll, Access revocation, Notifications |
| `org.structure_changed` `[REF]`                                                                                                                                                 | Organization           | Scope cache refresh, Org chart read model                         |
| `manager.changed` `[REF]`                                                                                                                                                       | Employees/Organization | Approval routing, notification routing                            |
| `contract.created`, `contract.updated`                                                                                                                                          | Contracts              | Payroll (P3), Notifications                                       |
| `document.uploaded`, `document.scanned`                                                                                                                                         | Documents              | AV pipeline, Audit, Onboarding                                    |
| `import.completed`, `import.failed`                                                                                                                                             | Imports                | Notifications, Audit                                              |
| `approval.requested`, `approval.decided`                                                                                                                                        | Approvals              | Notifications, subject module                                     |
| `notification.queued`, `notification.delivered`                                                                                                                                 | Notifications          | Delivery audit                                                    |
| Future: `offer.accepted`, `onboarding.completed`, `timesheet.approved`, `leave.approved`, `payroll_run.approved`, `payroll_run.paid`, `work_order.approved`, `review.completed` | respective domains     | Payroll/Billing/Reporting/Notifications `[REF]`                   |

## 4. Queues and workers

| Queue                                         | Purpose                            | Concurrency        | Retry       | DLQ |
| --------------------------------------------- | ---------------------------------- | ------------------ | ----------- | --- |
| `outbox-dispatch`                             | Claim + publish events             | 1 (leader-elected) | 5, exp 5 s  | yes |
| `notifications.email`                         | Send email via provider/Mailhog    | 5                  | 5, exp 5 s  | yes |
| `notifications.inapp`                         | Persist in-app notification        | 10                 | 3, exp 1 s  | yes |
| `documents.scan`                              | AV scanning integration            | 2                  | 3, exp 10 s | yes |
| `imports.process`                             | CSV validation/import              | 1 per tenant       | 3, exp 10 s | yes |
| `audit.retention`                             | Archive old audit/outbox rows (P7) | 1                  | 3           | yes |
| Future `payroll.calculate`, `reports.project` | isolated heavy work                | tuned later        | 3–5         | yes |

Worker process is a second entrypoint in `apps/api` (`src/worker.ts`), sharing modules and Prisma client with the API but started as a separate container `[REF]`.

## 5. Idempotency rules

1. **Producer:** `eventId` unique per `(tenant_id, event_id)`; retries reuse the same ID.
2. **Transport:** BullMQ `jobId = eventId` deduplicates enqueues.
3. **Consumer handlers:** always check a processed-event marker before writing:
   - Use `idempotency_keys` with `scope = 'event:<eventType>'` and `idemKey = eventId` (reusing the existing table), or the target row's natural key with upsert.
   - Example: notification consumer uses `notifications(tenant_id, dedupe_key)` unique; duplicate events update nothing.
   - Import worker uses `import_jobs(tenant_id, idempotency_key)` unique.
4. **Business effects:** no consumer increments counters or appends ledger rows without a uniqueness guard.
5. **Clock/event time:** payload carries `occurred_at`; consumers use it (not processing time) for effective dating.

## 6. Failure handling and observability

- Exponential backoff with jitter; max 5 attempts; DLQ per queue with replay tool (`npm run jobs:replay -- --queue=... --id=...`).
- Circuit breaker for email/AV/provider calls; after threshold, jobs are retried later rather than hammering the provider `[REF]`.
- Pino logs include `eventId`, `jobId`, `tenantId`, `attempt`; PII redacted.
- Metrics: queue depth, oldest job age, outbox pending count, publish lag, failure rate, DLQ depth; alerts on lag > 60 s or DLQ > 0.
- Outbox reconciler compares published events with processed markers and alerts on stuck events.

## 7. Notification delivery flow (example)

1. Business service writes business row + `domain_event_outbox`.
2. Publisher enqueues `employee.status_changed`.
3. Notification worker loads preferences, resolves recipients via RBAC scope (manager/HR), renders template, creates `notifications` row with `dedupe_key = eventId + userId + channel`.
4. Email worker sends through provider, records `sent_at`, status, provider message ID; failures retry with backoff and end in DLQ.
5. Delivery audit is appended as an outbox event (`notification.delivered`) — itself atomically committed.

## 8. Explicit non-goals now

- No Kafka/RabbitMQ: BullMQ on Redis satisfies the "message bus" role for P0/P1 and keeps deployment simple. The abstraction (`EventPublisher` interface) allows a dedicated bus later without domain changes `[REF] evolution path`.
- No event sourcing: outbox is a delivery mechanism, not a system of record; business tables remain authoritative.
