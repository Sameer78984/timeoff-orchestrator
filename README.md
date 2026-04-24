# Time-Off Orchestrator Microservice

A production-grade distributed microservice built with NestJS to proxy and manage employee time-off requests. It maintains high local availability while enforcing eventual consistency against an external Human Capital Management (HCM) System of Record.

## 🏗 System Architecture Synopsis
- **Feature-Based Modularity:** Distinct domains (`Employee`, `Balance`, `TimeOff`, `Sync`, `HcmIntegration`) guarantee decoupled bounds.
- **Transactional Outbox Pattern:** Writes to `TimeOffRequest` and asynchronous HCM relay payloads are committed atomically.
- **Eventual Consistency Cache:** Local `Available` vs `Reserved` balances provide instant validation, reconciling with the HCM asynchronously via batch jobs.

## ⏱ TimeOffRequest State Machine
- `PENDING_LOCAL`: Reserved locally, queued for HCM sync.
- `APPROVED`: Confirmed locally and propagated successfully to the HCM.
- `REJECTED_HCM`: HCM denied request. Local `Reserved` balances rolled back.
- `FAILED_SYNC`: Unrecoverable network partition. Enters dead-letter queue.

## 🌐 API Endpoints

### Time-Off Domain
- `POST /time-off/request`
  - **Purpose:** Submit a new time off request constraint evaluation.
  - **Payload:** `{ "employeeId": "uuid", "locationId": "string", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }`
  - **Header:** `Idempotency-Key` required.

### Balance Domain
- `GET /balance/:employeeId/:locationId`
  - **Purpose:** Retrieve live cached balance. Returns `Total (Authoritative)`, `Reserved (Inflight)`, and `Available`.

### Sync Domain
- `POST /sync/:locationId`
  - **Purpose:** Trigger forced batch reconciliation to resolve drift from the HCM source of truth.

## 💻 Setup & Execution

### Requirements
- Node.js v18+
- npm v9+

### Quickstart
```bash
# Install dependencies
npm install

# Start development server
npm run start:dev

# Access API Swagger definition
open http://localhost:3000/api/docs
```

## 🧪 Testing Strategy
The test suite ensures robust verification of consistency guarantees.
- **Unit Tests:** Deterministic mocking of transactional bounds outbox interactions.
- **Failure Simulation:** Simulates 5xx HCM faults to guarantee outbox retry functions trigger correctly.
- **Execution:** `npm run test` or `npm run test -- --coverage`
# timeoff-orchestrator
