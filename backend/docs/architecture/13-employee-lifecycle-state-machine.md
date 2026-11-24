# 13 — Employee Lifecycle State Machine

The transition matrix is reproduced **exactly** from the reference PDF `[REF]` (section 17). `Y` = allowed, `Y*` = allowed but discouraged, `–` = forbidden (HTTP 409).

## 1. States

| State        | Meaning                                                            |
| ------------ | ------------------------------------------------------------------ |
| `draft`      | Record created but not yet confirmed for onboarding.               |
| `onboarding` | Hire initiated; paperwork/provisioning in progress.                |
| `active`     | Actively employed.                                                 |
| `on_leave`   | Temporarily absent (leave of absence, not routine leave requests). |
| `suspended`  | Employment temporarily withheld pending investigation.             |
| `terminated` | Employment ended.                                                  |
| `archived`   | Historical record retained for compliance.                         |

## 2. Transition matrix

| From \ To      | draft | onboarding | active | on_leave | suspended | terminated | archived |
| -------------- | ----- | ---------- | ------ | -------- | --------- | ---------- | -------- |
| **draft**      | –     | Y          | Y*     | –        | –         | Y          | Y        |
| **onboarding** | –     | –          | Y      | –        | Y         | Y          | –        |
| **active**     | –     | –          | –      | Y        | Y         | Y          | –        |
| **on_leave**   | –     | –          | Y      | –        | Y         | Y          | –        |
| **suspended**  | –     | –          | Y      | –        | –         | Y          | –        |
| **terminated** | –     | –          | –      | –        | –         | –          | Y        |
| **archived**   | –     | –          | –      | –        | –         | –          | –        |

`Y*` Prefer `draft → onboarding → active`. Direct `draft → active` is permitted for compatibility (e.g. data imports) but should be flagged in audit metadata as `direct_activation` `[ASSUMPTION]`.

Terminal state: `archived` has no outgoing transitions. `terminated` can only move to `archived`.

## 3. Transition implementation

```ts
const TRANSITIONS: Record<EmployeeStatus, EmployeeStatus[]> = {
  draft: ['onboarding', 'active', 'terminated', 'archived'],
  onboarding: ['active', 'suspended', 'terminated'],
  active: ['on_leave', 'suspended', 'terminated'],
  on_leave: ['active', 'suspended', 'terminated'],
  suspended: ['active', 'terminated'],
  terminated: ['archived'],
  archived: [],
};
```

`EmployeesService.changeStatus(ctx, id, dto)`:

1. Load employee **within tenant and ABAC scope**; missing → 404.
2. Check `employees.change_status` permission and manager-specific transition limits `[ASSUMPTION]`.
3. Verify `dto.status ∈ TRANSITIONS[current]`; if not → `409 INVALID_STATUS_TRANSITION` with `from`, `to`, and allowed targets. No writes occur.
4. Open a single Prisma transaction; re-read with `SELECT ... FOR UPDATE` and check `version` (optimistic locking) → 409 `VERSION_CONFLICT` on mismatch.
5. Update `status`, `terminationDate` (when → terminated), `updatedBy`, `version++`.
6. Insert immutable `employment_history` row (`event_type = status_changed`, `from_values`/`to_values`, effective date, actor, reason).
7. Insert `audit_event` (`EMPLOYEE_STATUS_CHANGED`, redacted before/after) and `domain_event_outbox` (`EmployeeStatusChanged`) in the **same transaction** `[REF]`.
8. Commit; return redacted DTO.

## 4. Side effects per transition

| Transition                         | Immediate (P1)                                                   | Deferred / event-driven                                                                             |
| ---------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `draft → onboarding`               | History + audit + `EmployeeStatusChanged`.                       | Onboarding case creation (P4, via `OfferAccepted` / status event).                                  |
| `draft → active`                   | History + audit + outbox; audit flag `direct_activation`.        | Same as above; warn in dashboard.                                                                   |
| `onboarding → active`              | History + audit + outbox; set `hireDate` if absent.              | Provisioning completion check (P4).                                                                 |
| `active → on_leave`                | History + audit + outbox.                                        | Leave-of-absence record linkage (P2).                                                               |
| `on_leave → active`                | History + audit + outbox; clear long-leave flag.                 | Return-to-work checklist (P4).                                                                      |
| `any → suspended`                  | History + audit + outbox; record reason (required).              | Access restriction review; notifications.                                                           |
| `suspended → active`               | History + audit + outbox; reason required.                       | Restore access (P4/P7 integration).                                                                 |
| `any → terminated`                 | History + audit + outbox; set `terminationDate`; require reason. | Offboarding case, access revocation, contract close, payroll final run, document retention (P3/P4). |
| `any → archived` (from terminated) | History + audit + outbox.                                        | Retention policy scheduling.                                                                        |

Reason is required for `suspended` and `terminated` transitions `[ASSUMPTION]`; validation occurs at DTO level with conditional class-validator groups.

## 5. Concurrency and consistency

- `changeStatus` and `update` both use `version`; stale clients get 409 and must refetch.
- Two simultaneous transitions on one employee cannot both succeed due to row lock + version check.
- History rows are ordered by `effective_at`, with `occurred_at` as tiebreaker; outbox `event_id` is generated inside the transaction so retries cannot duplicate.
- `getHistory()` returns immutable rows only; no application endpoint can modify them.

## 6. Tests (see doc 18)

- Table-driven test over all 7×7 pairs: expected allowed/forbidden result exactly matches the matrix.
- Forbidden transition returns 409, creates no history/audit/outbox row.
- `direct_activation` flag appears in audit for `draft → active`.
- Termination sets `terminationDate`, writes reason, emits event.
- Concurrent transitions produce one success + one 409.
- Manager scope: manager can transition direct reports only; HR roles scoped; auditor gets 403.
