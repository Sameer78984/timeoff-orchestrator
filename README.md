<div align="center">

# ⚙️ Time-Off Orchestrator Microservice

### **Enterprise-Grade Distributed Eventual Consistency Architecture**

[![NestJS](https://img.shields.io/badge/NestJS-10+-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![TypeORM](https://img.shields.io/badge/TypeORM-0.3+-FE0902?style=for-the-badge)](https://typeorm.io/)

**A production-ready decoupled Microservice managing rigorous time-off invariants**

</div>

---

## 📋 Table of Contents

- [🌟 Overview](#-overview)
- [✨ Features](#-features)
- [🏗️ Architecture](#️-architecture)
- [📦 Project Structure](#-project-structure)
- [🛠️ Tech Stack](#️-tech-stack)
- [🚀 Getting Started](#-getting-started)
- [📡 API Endpoints](#-api-endpoints)
- [🛡️ Resilience & Security](#️-resilience--security)
- [🗄️ Database Schema](#️-database-schema)
- [🧪 Testing](#-testing)
- [📖 Deep Architecture (TRD)](#-deep-architecture)
- [🧠 Architectural Decisions (ADR)](#-architectural-decisions)

---

## 🌟 Overview

The **Time-Off Orchestrator** is a highly-available, transactional microservice acting as a hyper-fast local proxy against monolithic Human Capital Management (HCM) frameworks. It implements rigorous concurrency control alongside the Outbox and Idempotency patterns to seamlessly absorb punishing external HCM downtime.

### **Key Characteristics**

- ✅ **Eventual Consistency Focus** - Complete detachment from external HCM network latency
- ✅ **Manager Gatekeeping** - Granular, discrete multi-stage approval pipelines
- ✅ **Concurrency Hardened** - Pessimistic lock SQL transactional tracking on overlaps
- ✅ **Robust Idempotency** - Strict cache constraints preventing double-spend API network overlaps
- ✅ **Asynchronous Auditing** - Dedicated fire-and-forget anomaly and state auditing systems
- ✅ **TTL Soft Expiry** - Automated CRON reapers tearing down stale locked capacities

---

## ✨ Features

### **🔄 Event-Driven State Machine**
- 4-Stage Request Lifecycle (`PENDING_MANAGER_APPROVAL` -> `APPROVED` / `REJECTED` / `EXPIRED`)
- Soft-booking of reserved days mitigating overbooking limits prior to HCM clearance.
- Transactional rollbacks releasing allocations securely.

### **🛡️ Resiliency Operations**
- **Idempotency Flow**: Validated `Idempotency-Key` tracking matrix for fault-tolerant retries.
- **HCM Circuit Simulators**: Injection models designed to spoof heavy latency, failures, and fault timeouts proving queue strength.
- **TTL Reaper**: Time-based memory leaks mitigated by an orchestrated Nest schedule tearing down aging `PENDING_MANAGER_APPROVAL` queries.

### **📊 Auditing Operations**
- Dedicated Auditing Domain capturing exact JSON payloads defining precise boundary triggers.
- Isolated table space separating logging noise from intensive Balance constraint indexes.

---

## 🏗️ Architecture

### **System Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│                       HTTP REST CLIENTS                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Employee   │  │   Manager    │  │    Admins    │       │
│  │   Dashboards │  │   Approvals  │  │   Sync Tools │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTPS
┌─────────────────────────────────────────────────────────────┐
│                      API GATEWAY / NEST                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  TimeOff     │  │  Balance     │  │  Idempotency │       │
│  │  Controller  │  │  Controller  │  │  Validator   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                            ↕ In-Memory Locks / Eventual Consistency Sync
┌─────────────────────────────────────────────────────────────┐
│                      BUSINESS LOGIC LAYER                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   TimeOff    │  │   HCM Sync   │  │   Audit      │       │
│  │   Service    │  │   Service    │  │   Service    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                      DATA LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   TypeORM    │  │   SQLite     │  │  HCM Vendor  │       │
│  │   Query Runr │  │   Persistence│  │  (External)  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Project Structure

```
src/
├── audit/               # Anomaly & Event Logging
├── balance/             # Pre-Calculated Local Cache Thresholds
├── common/             
├── config/              
├── database/            # Connection configurations via TypeORM
├── employee/            
├── hcm-integration/     # Unstable 3rd-party vendor mock interface
├── idempotency/         # Header fault-tolerance cache
├── scheduler/           # Automated Cron TTL Reapers
├── sync/                # Manual Batch HCM Ledger reconciling handlers
├── time-off/            # Core state engine and concurrency locking
└── app.module.ts 
```

---

## 🛠️ Tech Stack

| Technology | Version | Purpose |
|:--------|:--------|:--------|
| **NestJS** | 10.x | Primary Application Framework |
| **TypeORM** | 0.3.x | Transactional ORM Abstraction |
| **SQLite3** | 5.1.x | Embeddable disk-level Relational storage |
| **Jest** | 29.x | Strict deterministic integration/E2E suites |
| **Swagger** | 7.x | Auto-generated OpenAPI Contracts |
| **Supertest** | 6.x | Network boundaries mock simulator |

---

## 🚀 Getting Started

### **Prerequisites**

- Node.js 20.x or higher
- npm 9.x or higher

### **Installation & Local Execution**

1. **Clone the deployment**
   ```bash
   git clone https://github.com/Sameer78984/timeoff-orchestrator.git
   cd timeoff-orchestrator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start Development Server (Hot Reload)**
   *(Implicitly hooks into SQLite in-memory generation on reboot)*
   ```bash
   npm run start:dev
   ```

4. **Start Production Server**
   ```bash
   npm run build
   npm run start:prod
   ```

5. **Verify Boot Constraints**
   - API Docs generated instantly at: `http://localhost:3000/api/docs`
   - Database schemas synchronize natively on launch.

---

## 📡 API Endpoints

### **Time-Off Submission Cycle**

#### `POST /time-off/request`
Allocates and reserves capacity locally if bounds do not overlap.

**Headers:**
- `Idempotency-Key` (Required)

**Payload:**
```json
{
  "employeeId": "emp-404",
  "locationId": "loc-20",
  "startDate": "2026-05-10T00:00:00Z",
  "endDate": "2026-05-15T00:00:00Z"
}
```

#### `GET /time-off/pending-approval`
Examines all queries queued structurally waiting for Manager interventions.

#### `PATCH /time-off/:id/approve`
Manager authority explicitly green-lighting the transfer flow to trigger the Async HCM validation sequence to reach Finalized.

#### `PATCH /time-off/:id/reject`
Manager authority explicitly rejecting query and unwinding the local SQL constraint buffers seamlessly.

---

### **Balance Auditing**

#### `GET /balance/:employeeId/:locationId`
Polls localized split metric constraints explicitly breaking out reserved limitations.

**Response:**
```json
{
  "totalDays": 20,
  "usedDays": 3,
  "pendingDays": 5
}
```

---

### **Batch Integrations**

#### `POST /sync/:locationId`
Manually forcing an immediate HCM Sync reconciliation pipeline against a specific demographic territory.

---

## 🛡️ Resilience & Security

### **Concurrency Lockdown Architecture**
The TypeORM integration completely rejects arbitrary query saves in favor of `QueryRunner` atomic closures enforcing isolated transaction spans.

### **Idempotency Guarantee**
Double-submissions generated rapidly by impatient users during load are intercepted by the `Idempotency-Key` lookup index, yielding immediate 200 HTTP responses resolving the exact historically generated payload.

### **Soft Expiration Lifecycle (Clean-ups)**
Because the system "soft blocks" pending requests against the hard total limit, managers failing to respond to a queue leaves the request artificially throttling system capacities. The Cron Expiry task resolves this automatically at minute-1 boundaries.

---

## 🗄️ Database Schema

```sql
┌─────────────┐       ┌─────────────┐       ┌──────────────┐
│  Employee   │       │   Balance   │       │ TimeOffReq   │
├─────────────┤       ├─────────────┤       ├──────────────┤
│ id (PK)     │       │ id (PK)     │       │ id (PK)      │
│ name        │──────►│ employeeId  │◄──────│ employeeId   │
│ department  │       │ locationId  │◄──────│ locationId   │
└─────────────┘       │ totalDays   │       │ startDate    │
                      │ usedDays    │       │ endDate      │
                      │ pendingDays │       │ status       │
                      └─────────────┘       └──────────────┘
                                                    │
                      ┌───────────────┐             │
                      │   AuditLog    │             │
                      ├───────────────┤             │
                      │ id (PK)       │             │
                      │ action        │◄────────────┘
                      │ entityId      │
                      │ payload (JSON)│
                      └───────────────┘
                                                
┌─────────────────┐
│ IdempotencyRec  │
├─────────────────┤
│ key (PK)        │
│ payloadHash     │
│ responseCache   │
│ createdAt       │
└─────────────────┘
```

---

## 🧪 Testing

The orchestration tests are rigidly mapped to E2E resilience constructs proving stability and dependency injection decoupling. We maintain a strict >90% coverage requirement.

### **Running the Test Suites**

1. **Unit & Integration Tests (Standard Run)**
   Executes the core business logic, mocking external dependencies, and validates idempotency against an active SQLite matrix.
   ```bash
   npm run test
   ```

2. **Test Coverage Telemetry**
   Generates a full statement, branch, and function coverage report.
   ```bash
   npm run test -- --coverage
   ```

3. **Watch Mode (TDD)**
   Runs the test engine in watch mode for active development.
   ```bash
   npm run test:watch
   ```

4. **End-to-End (E2E) Network Simulation**
   Runs complete application E2E tests against HTTP boundaries.
   ```bash
   npm run test:e2e
   ```

---

## 🧭 Developer Experience & Quick Testing (Swagger UI)

Swagger UI is available via `@nestjs/swagger` at:

```
http://localhost:3000/api/docs
```

It is the primary interface for quick evaluation, manual exploratory testing, and system validation without requiring Postman, scripts, or external tooling.

### **2-Minute Reviewer Flow**

Execute the following sequence in Swagger to validate the full request lifecycle end-to-end:

| Step | Action | Endpoint |
|:-----|:-------|:---------|
| 1 | Submit a time-off request | `POST /time-off/request` |
| 2 | Approve the request as manager | `PATCH /time-off/{id}/approve` |
| 3 | Submit a second request and reject it | `PATCH /time-off/{id}/reject` |
| 4 | Inspect the employee's live balance | `GET /balance/{employeeId}/{locationId}` |
| 5 | Force an HCM reconciliation | `POST /sync/{locationId}` |

### **Required Header**

`POST /time-off/request` requires the `Idempotency-Key` header (any UUID string). Set it in the **Headers** section of the Swagger request form before executing.

### **What Is Testable via Swagger**

- State machine transitions (`PENDING_MANAGER_APPROVAL` → `APPROVED` / `REJECTED` / `EXPIRED`)
- Balance reservation and rollback on rejection
- HCM success and failure simulation (the mock HCM has a 20% random failure rate)
- Idempotency key caching (replay the same key to verify the cached response is returned)
- Batch reconciliation against the mock HCM

> The system is fully self-testable via Swagger without requiring Postman, scripts, or external tooling.

---

## 📖 Deep Architecture

For advanced flow-mappings, specific queue reconciliation rules arrays, and logic constraints bridging the specific eventual consistency domain behaviors, review the attached explicit TRD Documentation: 

👉 **[Technical Requirements Document (TRD)](./TRD.md)**

---

## 🧠 Architectural Decisions

For a comprehensive ledger of every technical choice, tool selection, and architectural trade-off made during development, review the Architecture Decision Record (ADR):

👉 **[Architecture Decision Record (DECISION.md)](./DECISION.md)**

---

<div align="center">

### **Built with ❤️ using NestJS and SQLite**

[⬆ Back to Top](#️-time-off-orchestrator-microservice)

</div>
