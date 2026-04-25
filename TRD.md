# Technical Requirement Document (TRD)

## Project: Time-Off Orchestrator Microservice
**Version:** 2.0 | **Status:** Production-Ready | **Classification:** Internal Engineering Reference

---

## 1. System Overview

The Time-Off Orchestrator is a NestJS microservice using TypeORM and SQLite. It accepts and manages employee time-off requests through a gated multi-stage approval workflow. It maintains a local balance cache for fast validation while using an external Human Capital Management (HCM) system as the authoritative Source of Truth.

The service does **not** write to HCM. It reads from HCM during reconciliation and during manager-approval-triggered validation. All local writes are provisional until HCM confirms.

---

## 2. System Invariants

These rules hold at all times. All invariants are enforced at the service layer inside transaction boundaries before any database write. Any operation that would violate them must be rejected with an appropriate error before the database write occurs.

| ID | Invariant |
|:---|:----------|
| **INV-01** | `Balance.pendingDays >= 0` at all times. |
| **INV-02** | `Balance.usedDays + Balance.pendingDays <= Balance.totalDays` at all times. |
| **INV-03** | Each state transition maps to exactly one balance mutation executed inside a single transaction. No transition may trigger multiple mutations. |
| **INV-04** | A `TimeOffRequest` must exist in exactly one state at any point in time. |
| **INV-05** | Terminal states (`APPROVED`, `REJECTED`, `EXPIRED`) are immutable. No transition away from a terminal state is permitted. |
| **INV-06** | No two non-terminal `TimeOffRequest` records for the same `employeeId` may have overlapping `[startDate, endDate]` ranges. |
| **INV-07** | `idempotencyKey` replay returns the original response. It must not re-execute balance mutations, HCM calls, or state transitions. |
| **INV-08** | `endDate` must be greater than or equal to `startDate`. |

---

## 3. API Contract

### 3.1 Time-Off Domain

#### `POST /time-off/request`
- **Purpose:** Submit a new time-off request. Reserves balance locally and sets status to `PENDING_MANAGER_APPROVAL`.
- **Headers:**
  - `Idempotency-Key` (Required, UUID string): Used to prevent duplicate processing on network retries.
- **Request Body:**
  ```json
  {
    "employeeId": "string (non-empty)",
    "locationId": "string (non-empty)",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD"
  }
  ```
- **Pre-Conditions (checked in order, fail-fast):**
  1. `Idempotency-Key` header is present. If not → `400 Bad Request`.
  2. `endDate >= startDate`. If not → `400 Bad Request`.
  3. `requestedDays = (endDate - startDate) + 1`.
  4. `Balance.totalDays - Balance.usedDays - Balance.pendingDays >= requestedDays`. If not → `400 Bad Request`.
  5. No existing `TimeOffRequest` for the same `employeeId` with an overlapping date range and a non-terminal status exists. If found → `400 Bad Request`.
- **On Success:**
  1. `Balance.pendingDays` incremented by `requestedDays` inside a single SQL transaction.
  2. `TimeOffRequest` created with status `PENDING_MANAGER_APPROVAL` inside the same transaction.
  3. Returns `201 Created` with the full `TimeOffRequest` entity.
- **Idempotency Hit:** If `Idempotency-Key` has been seen before with the same payload hash → Returns `200 OK` with the original response. No side effects are re-executed.
- **Idempotency Conflict:** If `Idempotency-Key` has been seen before but the payload hash differs → Returns `409 Conflict`.

---

#### `PATCH /time-off/:id/approve`
- **Purpose:** Manager approves the request. The system validates against HCM synchronously, then resolves to `APPROVED` or `REJECTED`.
- **Pre-Conditions:**
  1. Request with given `id` exists. If not → `404 Not Found`.
  2. Request status is `PENDING_MANAGER_APPROVAL`. If not → `400 Bad Request`.
- **Execution Sequence:**
  1. `HcmIntegrationService.validateTimeOff(employeeId, locationId, requestedDays)` is called synchronously without an open DB transaction.
  2. **On HCM `200 OK` (valid):** A single transaction opens. Status transitions to `APPROVED`. `Balance.pendingDays` decremented by `requestedDays`. `Balance.usedDays` incremented by `requestedDays`. Returns `200 OK`.
  3. **On HCM `400` (policy violation):** A single transaction opens. Status transitions to `REJECTED`. `Balance.pendingDays` decremented by `requestedDays`. Return 200 OK with status = REJECTED.
  4. **On HCM `5xx` or network timeout:** No transaction is opened. The request remains at `PENDING_MANAGER_APPROVAL`. Returns `502 Bad Gateway`. The manager must click approve again later.
- **Balance Note:** Balance mutation for the success path (step 2) and the HCM-rejection path (step 3) occurs immediately and synchronously. There is no deferred rollback.

---

#### `PATCH /time-off/:id/reject`
- **Purpose:** Manager permanently rejects the request without contacting HCM.
- **Pre-Conditions:**
  1. Request with given `id` exists. If not → `404 Not Found`.
  2. Request status is `PENDING_MANAGER_APPROVAL`. If not → `400 Bad Request`.
- **Execution Sequence:**
  1. Status transitions to `REJECTED`.
  2. `Balance.pendingDays` decremented by `requestedDays`.
  3. Returns `200 OK` with the updated `TimeOffRequest`.

---

#### `GET /time-off/pending-approval`
- **Purpose:** Returns all requests in `PENDING_MANAGER_APPROVAL` state.
- **Response (200 OK):** Array of `TimeOffRequest` objects. Empty array if none exist.

---

#### `POST /sync/:locationId`
- **Purpose:** Triggers a manual batch reconciliation against HCM for all employees at the specified `locationId`.
- **Reconciliation Rules:**
  1. HCM `totalDays` overwrites local `Balance.totalDays`.
  2. HCM `usedDays` overwrites local `Balance.usedDays`.
  3. Local `Balance.pendingDays` is **never** overwritten. It is managed exclusively by local state transitions.
  4. After overwrite, if `INV-02` is violated (`usedDays + pendingDays > totalDays`), the system logs a `BALANCE_DRIFT_ALERT` and sets `pendingDays = totalDays - usedDays` to restore validity. This condition indicates inflight requests were approved in HCM before local reconciliation occurred.
- **Response (200 OK):** Returns a summary of records updated.

---

### 3.2 Balance Domain

#### `GET /balance/:employeeId/:locationId`
- **Purpose:** Retrieve the local cached balance for a given employee and location.
- **Response (200 OK):**
  ```json
  {
    "totalDays": "number",
    "usedDays": "number",
    "pendingDays": "number"
  }
  ```
- **Note:** This reflects local state, not HCM state. It may lag HCM by up to one sync cycle.

---

## 4. State Machine

### 4.1 State Definitions

| State | Type | Description |
|:------|:-----|:------------|
| `PENDING_MANAGER_APPROVAL` | Active | Created. Balance reserved. Awaiting manager action. |
| `APPROVED` | Terminal | HCM confirmed. Balance finalized (`usedDays` incremented). |
| `REJECTED` | Terminal | Manager denied, or HCM denied. `pendingDays` released. |
| `EXPIRED` | Terminal | TTL cron reaped the request after 30 minutes of inactivity. `pendingDays` released. |

### 4.2 Valid Transitions

| From | To | Trigger |
|:-----|:---|:--------|
| *(creation)* | `PENDING_MANAGER_APPROVAL` | `POST /time-off/request` success |
| `PENDING_MANAGER_APPROVAL` | `APPROVED` | `PATCH /time-off/:id/approve` → HCM returns `200 OK` |
| `PENDING_MANAGER_APPROVAL` | `REJECTED` | `PATCH /time-off/:id/approve` → HCM returns `400` |
| `PENDING_MANAGER_APPROVAL` | `REJECTED` | `PATCH /time-off/:id/reject` |
| `PENDING_MANAGER_APPROVAL` | `EXPIRED` | TTL cron job fires after 30-minute threshold |

### 4.3 Invalid Transitions
Any attempt to execute a transition not listed in 4.2 returns `400 Bad Request` with error code `INVALID_STATE_TRANSITION`. Terminal states (`APPROVED`, `REJECTED`, `EXPIRED`) accept no further transitions.

---

## 5. Balance Logic Specification

The strategy is: **Reserve BEFORE manager approval, with rollback on all rejection paths.**

### 5.1 Complete Balance Mutation Map

| Event | `pendingDays` | `usedDays` |
|:------|:-------------|:-----------|
| `POST /time-off/request` success | +`requestedDays` | No change |
| `PATCH /approve` → HCM `200 OK` | −`requestedDays` | +`requestedDays` |
| `PATCH /approve` → HCM `400` | −`requestedDays` | No change |
| `PATCH /reject` | −`requestedDays` | No change |
| TTL Cron → `EXPIRED` | −`requestedDays` | No change |

### 5.2 HCM Rejection Rollback (Critical Edge Case)

When HCM rejects a request that already has `pendingDays` reserved:
1. The rejection is confirmed via HCM `400` response synchronously during `PATCH /approve`.
2. Balance rollback (`pendingDays - requestedDays`) occurs **immediately** in the same synchronous handler.
3. The rollback and status update to `REJECTED` are executed in a single SQL transaction to guarantee atomicity (no partial state).
4. No retry mechanisms exist for balance mutations. All outbound HCM calls are handled synchronously via HcmIntegrationService. It is strictly bounded by single synchronous transactions.

---

## 6. Consistency Model

### 6.1 Source of Truth
HCM is the authoritative source for `totalDays` and `usedDays`. The local database is an eventual-consistency cache. Reads from `GET /balance` return local state, which may diverge from HCM by up to one reconciliation cycle.

### 6.2 Concurrency Control
The `POST /time-off/request` handler uses a TypeORM `QueryRunner` to execute all validation reads and writes. SQLite enforces write serialization via database-level locking. Correctness relies on application-level transaction boundaries, not isolation level guarantees. This prevents two concurrent requests from both passing the balance check against the same `pendingDays` value. If two requests arrive simultaneously, one will acquire the transaction lock; the other will be queued behind it and evaluated against the already-mutated balance.

### 6.3 Reconciliation Conflict Rule
During `POST /sync/:locationId`, HCM data overwrites `totalDays` and `usedDays` only. `pendingDays` is never overwritten. If the overwrite causes `usedDays + pendingDays > totalDays`, the system clamps `pendingDays` to `totalDays - usedDays` and emits a `BALANCE_DRIFT_ALERT` log entry.

### 6.4 Idempotency and Consistency Boundary
Idempotency guarantees **response consistency**, not repeated state transitions. A replayed `Idempotency-Key` returns the archived HTTP response from the first successful execution. It does not re-run the balance check, re-reserve capacity, or call HCM again. The state machine state is not re-entered.

---

## 7. Failure Handling

### 7.1 Idempotency

| Scenario | Behavior |
|:---------|:---------|
| First request with a new key | Process normally. Store `{key, payloadHash, responseBody}`. |
| Repeated key, same payload hash | Return stored `responseBody` with `200 OK`. Zero side effects. |
| Repeated key, different payload hash | Return `409 Conflict`. No processing occurs. |

Idempotency records are persisted in the database and survive process restarts.

### 7.2 HCM Fault During Approval

| Scenario | Immediate Outcome | Recovery |
|:---------|:-----------------|:---------|
| HCM `5xx` or timeout | Status stays `PENDING_MANAGER_APPROVAL`. Return `502`. | Manager clicks approve again later. No local state was changed. |
| HCM `400` | Status set to `REJECTED`. `pendingDays` rolled back immediately. | No retry. Rejection is final. |

Retrying PATCH /approve after HCM failure is safe because no local state mutation occurs before a successful HCM response.

### 7.3 Circuit Breaker

The circuit breaker is applied at the `HcmIntegrationService` adapter layer. It wraps all outbound HCM HTTP calls.

| State | Condition | Behavior |
|:------|:----------|:---------|
| `CLOSED` | Default state. | All requests pass through to HCM normally. |
| `CLOSED → OPEN` | Failure rate exceeds 20% within a rolling 60-second window. | Circuit opens. All HCM calls immediately return a local error without hitting the network. All outbound HCM calls are handled synchronously via HcmIntegrationService. |
| `OPEN` | Circuit is open. | Incoming HCM calls are rejected immediately (no network call). The `PATCH /approve` endpoint returns `503 Service Unavailable`. |
| `OPEN → HALF_OPEN` | 5-minute cooldown elapses after circuit opened. | Circuit allows exactly 1 probe request through. |
| `HALF_OPEN → CLOSED` | Probe request returns `2xx`. | Circuit closes. Normal operation resumes. |
| `HALF_OPEN → OPEN` | Probe request fails. | Circuit re-opens. 5-minute cooldown restarts. |

### 7.4 TTL Expiry

The `ExpiryService` cron job runs every 60 seconds. It queries all `TimeOffRequest` records in `PENDING_MANAGER_APPROVAL` state with `createdAt < (now - 30 minutes)`. For each:
1. Status transitions to `EXPIRED`.
2. `Balance.pendingDays` decremented by `requestedDays`.
3. Both writes execute in a single SQL transaction. If the transaction fails, the record is retried on the next cron cycle.

---

## 8. Developer Experience & Quick Testing (Swagger UI)

Swagger UI is available via `@nestjs/swagger` at:

```
http://localhost:3000/api/docs
```

It is the primary interface for quick evaluation, manual testing, and system validation. No external tooling is required.

### 8.1 Reviewer Validation Flow

Execute the following sequence in Swagger to exercise the full state machine:

| Step | Action | Endpoint |
|:-----|:-------|:---------|
| 1 | Submit a time-off request | `POST /time-off/request` |
| 2 | Approve the request as manager | `PATCH /time-off/{id}/approve` |
| 3 | Submit a second request and reject it | `PATCH /time-off/{id}/reject` |
| 4 | Inspect the employee's live balance | `GET /balance/{employeeId}/{locationId}` |
| 5 | Force an HCM reconciliation | `POST /sync/{locationId}` |

### 8.2 Required Header

`POST /time-off/request` requires the `Idempotency-Key` header (any UUID string). Set it in the **Headers** section of the Swagger request form before executing. Omitting this header returns `400 Bad Request`.

### 8.3 What Is Testable via Swagger

- State machine transitions: full path from `PENDING_MANAGER_APPROVAL` → `APPROVED` and `REJECTED`.
- Balance reservation and rollback: `pendingDays` increments on request creation and decrements on rejection.
- HCM failure simulation: the mock HCM has a 20% random failure rate, producing observable `502` responses on `/approve`.
- Idempotency caching: replaying a request with the same `Idempotency-Key` returns the archived response without re-executing any side effects.
- Batch reconciliation: `POST /sync/{locationId}` overwrites `totalDays` / `usedDays` from the mock HCM.

> Core state machine and balance behavior are testable via Swagger. Advanced scenarios (idempotency conflict, circuit breaker transitions) require controlled inputs or automated tests.

---

## 9. Known Limitations

| Limitation | Impact | Mitigation |
|:-----------|:-------|:-----------|
| SQLite serializes concurrent writes | Throughput bottleneck under high write concurrency. | Acceptable for single-node deployment. Migration path to PostgreSQL is supported by TypeORM config change only. |
| No real-time HCM webhook listener | Local state may diverge from HCM until next sync. | Mitigated by `POST /sync/:locationId` for manual reconciliation. |
