# Time-Off Orchestrator Microservice

A production-grade distributed microservice built with **NestJS**, **SQLite**, and **TypeORM** designed to proxy and seamlessly manage employee time-off requests. It maintains high localized API availability while enforcing strict eventual consistency against an external, potentially brittle Human Capital Management (HCM) System of Record.

---

## 📄 Technical Architecture Documentation
For a deep dive into the System state engines, failure mitigation paths (Circuit Breakers/Idempotency), and data synchronization constraints, please review the rigorous **[Technical Requirements Document (TRD)](./TRD.md)**.

---

## 🏗 System Architecture Synopsis
- **Feature-Based Modularity:** Independent bounded domains (`Employee`, `Balance`, `TimeOff`, `Sync`, `HcmIntegration`) guarantee explicit dependency isolation.
- **Transactional Outbox & Safe Relays:** Database writes to the local `TimeOffRequest` state leverage TypeORM Query-Runners acting within pessimistic SQL locks protecting concurrent users from dirty-reading limits.
- **Eventual Consistency Cache:** A composite indexing on `Available` vs `Reserved` buffers guarantees sub-50ms user validations locally while deferring heavyweight processing asynchronously.

## ⏱ TimeOffRequest State Machine (Manager Approval Flow)
The request flow embraces an uncompromising sequence strictly gatekeeping API cascades against unapproved human states:
1. `REQUESTED`: Initial request generated context.
2. `PENDING_MANAGER_APPROVAL`: Balance strictly reserved locally with an active TTL lock. Pending supervisor OK.
3. `PENDING_HCM_VALIDATION`: Supervisor approved; outbox runner asynchronously verifying against authoritative HCM.
4. `APPROVED`: The ultimate terminus. HCM processed and validated the consumption safely.
5. `REJECTED`: Local Manager organically denied OR HCM rejected the batch override. Safe rollbacks applied immediately.
6. `EXPIRED`: Handled by the internal TTL cron job softly reaping requests that a manager ignored for >30 minutes to un-book locked allocations.

## 🛡 Active Resilience Mechanics
- **Robust Idempotency Protection**: A unique caching matrix guaranteeing duplicated network `Idempotency-Key` resubmissions immediately resolve without causing database state corruption on the ledger.
- **Atomic Audit Trail Firing**: An independent fire-and-forget worker asynchronously mapping precise state change anomalies (`REQUEST_CREATED`, `EXPIRED`, `APPROVED`) decoupled from the primary HTTP transaction blocks.

---

## 🌐 API Endpoints

### 1. Manager & Employee Requests (Time-Off Domain)
- `POST /time-off/request`
  - **Purpose:** Submit an overlapping constraint sequence to generate a new record. 
  - **Payload Requirement:** `{ "employeeId": "uuid", "locationId": "string", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }`
  - **Header Safety:** `Idempotency-Key` (Required)
  
- `PATCH /time-off/:id/approve`
  - **Purpose:** Supervisor endpoint unlocking a request pushing it definitively to HCM ingestion phases.

- `PATCH /time-off/:id/reject`
  - **Purpose:** Immediate denial wiping the local `Reserved` day reservation cleanly allowing future requests to instantly succeed.

- `GET /time-off/pending-approval`
  - **Purpose:** Queue extraction listing all requests currently gated by the Manager constraint.

### 2. Balance Authority
- `GET /balance/:employeeId/:locationId`
  - **Purpose:** Retrieve live cached telemetry isolating specific `Reserved (Inflight)` vs `Total (Authoritative)`.

### 3. Sync Reconciliations
- `POST /sync/:locationId`
  - **Purpose:** Trigger forced explicit batch execution querying the monolithic HCM to wipe localized drift on an accelerated pipeline outside the nightly automated run bounds.

---

## 💻 Setup & Execution

### Local Build Requirements
- Node.js v18+
- npm v9+

### Quickstart Execution
```bash
# 1. Install localized dependencies ensuring no global collisions:
npm install

# 2. Boot the persistent engine locally forcing database sync sequences:
npm run start:dev

# 3. Assess the explicitly mapped Swagger Definitions testing endpoints natively:
open http://localhost:3000/api/docs
```

## 🧪 Testing Coverage Execution
The localized test suite leverages deterministic jest assertions strictly ensuring that E2E API logic validates against the SQLite DI constructs heavily utilizing mock dependency overlaps. 

```bash
# General Unit + Isolated Integration Bounds
npm run test

# Full Coverage Output 
npm run test -- --coverage
```
