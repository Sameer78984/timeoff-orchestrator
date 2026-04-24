# Technical Requirement Document (TRD)

## Project: Time-Off Orchestrator Microservice
**Version:** 2.0 | **Status:** Production-Ready | **Classification:** Internal Engineering Reference

---

## 1. System Overview

The Time-Off Orchestrator is a NestJS microservice using TypeORM and SQLite. It accepts and manages employee time-off requests through a gated multi-stage approval workflow. It maintains a local balance cache for fast validation while using an external Human Capital Management (HCM) system as the authoritative Source of Truth.

The service does **not** write to HCM. It reads from HCM during reconciliation and during manager-approval-triggered validation. All local writes are provisional until HCM confirms.

---

## 2. System Invariants

These rules hold at all times. Any operation that would violate them must be rejected with an appropriate error before the database write occurs.

| ID | Invariant |
|:---|:----------|
| **INV-01** | `Balance.pendingDays >= 0` at all times. |
| **INV-02** | `Balance.usedDays + Balance.pendingDays <= Balance.totalDays` at all times. |
| **INV-03** | Every state transition produces exactly one balance mutation. No transition may modify the balance more than once. |
| **INV-04** | A `TimeOffRequest` must exist in exactly one state at any point in time. |
| **INV-05** | Terminal states (`APPROVED`, `REJECTED`, `EXPIRED`) are immutable. No transition away from a terminal state is permitted. |
| **INV-06** | No two non-terminal `TimeOffRequest` records for the same `employeeId` may have overlapping `[startDate, endDate]` ranges. |
| **INV-07** | `idempotencyKey` replay returns the original response. It must not re-execute balance mutations, HCM calls, or state transitions. |

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
- **Purpose:** Manager approves the request. Transitions status to `PENDING_HCM_VALIDATION`, then immediately calls the HCM. Resolves to `APPROVED` or `REJECTED` based on HCM response.
- **Pre-Conditions:**
  1. Request with given `id` exists. If not → `404 Not Found`.
  2. Request status is `PENDING_MANAGER_APPROVAL`. If not → `400 Bad Request`.
- **Execution Sequence:**
  1. Status transitions to `PENDING_HCM_VALIDATION`. Written to DB.
  2. `HcmIntegrationService.validateTimeOff(employeeId, locationId, requestedDays)` is called synchronously.
  3. **On HCM `200 OK` (valid):** Status transitions to `APPROVED`. `Balance.pendingDays` decremented by `requestedDays`. `Balance.usedDays` incremented by `requestedDays`. Returns `200 OK`.
  4. **On HCM `400` (policy violation):** Status transitions to `REJECTED`. `Balance.pendingDays` decremented by `requestedDays`. Returns `400 Bad Request`.
  5. **On HCM `5xx` or network timeout:** Request remains at `PENDING_HCM_VALIDATION`. Returns `502 Bad Gateway`. Retry is delegated to the Outbox relay worker (see Section 6.2).
- **Balance Note:** Balance mutation for the success path (step 3) and the HCM-rejection path (step 4) occurs immediately and synchronously. There is no deferred rollback for these two cases.

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
| `PENDING_HCM_VALIDATION` | Active | Manager approved. HCM call in-flight or queued for retry. |
| `APPROVED` | Terminal | HCM confirmed. Balance finalized (`usedDays` incremented). |
| `REJECTED` | Terminal | Manager denied, or HCM denied. `pendingDays` released. |
| `EXPIRED` | Terminal | TTL cron reaped the request after 30 minutes of inactivity. `pendingDays` released. |

### 4.2 Valid Transitions

| From | To | Trigger |
|:-----|:---|:--------|
| *(creation)* | `PENDING_MANAGER_APPROVAL` | `POST /time-off/request` success |
| `PENDING_MANAGER_APPROVAL` | `PENDING_HCM_VALIDATION` | `PATCH /time-off/:id/approve` |
| `PENDING_MANAGER_APPROVAL` | `REJECTED` | `PATCH /time-off/:id/reject` |
| `PENDING_MANAGER_APPROVAL` | `EXPIRED` | TTL cron job fires after 30-minute threshold |
| `PENDING_HCM_VALIDATION` | `APPROVED` | HCM returns `200 OK` |
| `PENDING_HCM_VALIDATION` | `REJECTED` | HCM returns `400` (policy violation) |

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
2. Balance rollback (`pendingDays - requestedDays`) occurs **immediately** in the same synchronous handler, not via a background worker.
3. The rollback and status update to `REJECTED` are executed in a single SQL transaction to guarantee atomicity (no partial state).
4. No second rollback is triggered. The Outbox relay does not execute balance mutations; it only retries HCM network calls.

---

## 6. Consistency Model

### 6.1 Source of Truth
HCM is the authoritative source for `totalDays` and `usedDays`. The local database is an eventual-consistency cache. Reads from `GET /balance` return local state, which may diverge from HCM by up to one reconciliation cycle.

### 6.2 Concurrency Control
The `POST /time-off/request` handler uses a TypeORM `QueryRunner` to execute all validation reads and writes within a single serializable SQL transaction. This prevents two concurrent requests from both passing the balance check against the same `pendingDays` value. If two requests arrive simultaneously, one will acquire the transaction lock; the other will be queued behind it and evaluated against the already-mutated balance.

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

### 7.2 HCM Fault During Approval

| Scenario | Immediate Outcome | Recovery |
|:---------|:-----------------|:---------|
| HCM `5xx` or timeout | Status stays `PENDING_HCM_VALIDATION`. Return `502`. | Outbox relay retries with exponential backoff: 2s, 4s, 8s, 16s, 32s (max 5 attempts). |
| All 5 retries exhausted | Status set to `REJECTED`. `pendingDays` rolled back. | Manual admin intervention required. Alert emitted. |
| HCM `400` | Status set to `REJECTED`. `pendingDays` rolled back immediately. | No retry. Rejection is final. |

### 7.3 Circuit Breaker

The circuit breaker is applied at the `HcmIntegrationService` adapter layer. It wraps all outbound HCM HTTP calls.

| State | Condition | Behavior |
|:------|:----------|:---------|
| `CLOSED` | Default state. | All requests pass through to HCM normally. |
| `CLOSED → OPEN` | Failure rate exceeds 20% within a rolling 60-second window. | Circuit opens. All HCM calls immediately return a local error without hitting the network. Outbox relay pauses. |
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

## 8. Known Limitations

| Limitation | Impact | Mitigation |
|:-----------|:-------|:-----------|
| SQLite serializes concurrent writes | Throughput bottleneck under high write concurrency. | Acceptable for single-node deployment. Migration path to PostgreSQL is supported by TypeORM config change only. |
| No real-time HCM webhook listener | Local state may diverge from HCM until next sync. | Mitigated by `POST /sync/:locationId` for manual reconciliation. |
| `PENDING_HCM_VALIDATION` is not auto-retried on restart | After a service restart, orphaned `PENDING_HCM_VALIDATION` records are not automatically re-queued. | Acceptable temporary gap. Resolved by adding a startup bootstrap scan as a future enhancement. |
