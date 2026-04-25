<div align="center">

# 🧠 Architecture & Technical Decisions (ADR)

### **Time-Off Orchestrator Microservice**

[![NestJS](https://img.shields.io/badge/NestJS-10+-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TypeORM](https://img.shields.io/badge/TypeORM-0.3+-FE0902?style=for-the-badge)](https://typeorm.io/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)

**A comprehensive ledger of every technical choice, tool selection, and architectural trade-off made during development.**

</div>

---

## 📋 Table of Contents

- [🛠️ Core Technology Stack](#️-core-technology-stack)
- [🏗️ Architectural Paradigms](#️-architectural-paradigms)
- [🔄 State Machine & Concurrency](#-state-machine--concurrency)
- [⚖️ Balance & Data Ownership](#️-balance--data-ownership)
- [🧪 Testing & Quality Assurance](#-testing--quality-assurance)
- [🧩 Minor Utility Decisions](#-minor-utility-decisions)

---

## 🛠️ Core Technology Stack

### **Language: TypeScript**
**Decision**: Strict superset of JavaScript compiled to ES2022.
**Justification**: Enterprise financial/HR systems require rigid type safety. TypeScript prevents entire classes of runtime errors (like null-pointer exceptions on `balance` objects) and provides world-class IDE introspection. We enabled `strictNullChecks` to ensure domain invariants are mathematically sound.

### **Framework: NestJS**
**Decision**: Heavy, opinionated, Angular-style dependency injection framework.
**Justification**: NestJS enforces a highly organized, modular structure. By separating concerns into Controllers, Services, Filters, and Interceptors, the codebase remains decoupled. The built-in Dependency Injection (DI) makes mocking external dependencies (like the HCM simulator) trivial during testing.

### **Database: SQLite (In-Memory/File-based)**
**Decision**: Lightweight embeddable database engine.
**Justification**: Selected specifically for this microservice mockup and local development experience. It requires zero Docker orchestration to boot, making the reviewer experience frictionless. Despite being lightweight, it natively supports strict ACID transactions necessary for our concurrency testing.

### **ORM: TypeORM**
**Decision**: Active Record / Data Mapper hybrid ORM.
**Justification**: TypeORM provides the `QueryRunner` API, which is absolutely critical for our **Single Bounded Transaction** model. It allows manual connection leasing, transaction starting, and explicit rollbacks upon failure, preventing partial database writes.

---

## 🏗️ Architectural Paradigms

### **Eventual Consistency via HCM Proxy**
**Decision**: The microservice operates as a high-speed local proxy rather than directly polling the monolithic Human Capital Management (HCM) system.
**Justification**: HCM APIs are notoriously slow and prone to 502/504 timeouts. By holding a local replica of "Balance" and acting as an eventual-consistency queue, we protect internal systems from external infrastructure failure.

### **Idempotency Matrix**
**Decision**: Implementation of a strict `Idempotency-Key` header cache for the `POST /time-off/request` endpoint.
**Justification**: In distributed systems, network blips cause users to click "Submit" multiple times. The idempotency layer ensures that a duplicate request returns the historically cached 200 OK response without duplicating the database entity or draining the balance twice.

### **Single Bounded Transactions (QueryRunner)**
**Decision**: All mutations (Create, Approve, Reject) execute within exactly **ONE** explicit transaction.
**Justification**: Mixing external HTTP calls inside an active database transaction causes connection pool starvation and database deadlocks. 
- **Rule Enforced**: External calls (`validateTimeOff`) are executed *outside* the transaction. The transaction is only opened to re-read the state, verify it hasn't changed, and commit the final `APPROVED` or `REJECTED` state.

---

## 🔄 State Machine & Concurrency

### **Strict 4-State Linear Machine**
**Decision**: The `TimeOffStatus` enum was restricted to exactly 4 states:
1. `PENDING_MANAGER_APPROVAL`
2. `APPROVED`
3. `REJECTED`
4. `EXPIRED`

**Justification**: Previous iterations suffered from "state bloat" (e.g., `REQUESTED`, `PENDING_HCM_VALIDATION`). These intermediate states act as hidden retry loops and introduce non-deterministic race conditions. By moving to a 4-state immutable-terminal design, the business logic became drastically simpler and mathematically provable. Terminal states (`APPROVED`, `REJECTED`, `EXPIRED`) cannot be mutated.

### **TTL Cron Reaper (Expiry Service)**
**Decision**: `@nestjs/schedule` CRON job that sweeps the database every minute for stale requests.
**Justification**: A `PENDING` request locally locks/reserves `pendingDays`. If a manager never approves or rejects it, those days are locked forever. The CRON job ages out abandoned requests to `EXPIRED` and securely releases the locked capacity back to the employee.

---

## ⚖️ Balance & Data Ownership

### **Strict Field-Level Ownership**
**Decision**: The balance entity is split between External and Internal owners.
| Field | Owner | Mutation Rule |
|:---|:---|:---|
| `totalDays` | HCM | Sync Overwrite Only |
| `usedDays` | HCM | Sync Overwrite Only |
| `pendingDays` | Local Service | Local +/- mutations only |

**Justification**: Dual-writer environments inevitably lead to data corruption. By strictly forbidding the local orchestrator from mutating `usedDays` during an approval, we prevent "split-brain" ledger corruption. 

### **The Mathematical Invariant Guard**
**Decision**: Implementing `Math.max(0, balance.pendingDays - requestedDays)` during balance release.
**Justification**: Due to the nature of eventual consistency and forced Sync reconciliations, it is theoretically possible for a balance to drift. The floor clamp `Math.max(0)` guarantees that a database constraint violation (negative days) can never crash the runtime.

### **Pure Overwrite Sync System**
**Decision**: The Sync Service performs pure overwrites of HCM data rather than incremental merges.
**Justification**: Incremental syncs are brittle. Overwriting `totalDays` and `usedDays` directly from the source of truth, and only clamping `pendingDays` if an invariant breaks (`usedDays + pendingDays > totalDays`), ensures self-healing behavior.

---

## 🧪 Testing & Quality Assurance

### **Framework: Jest & Supertest**
**Decision**: Jest for the runner/assertions, Supertest for hitting NestJS HTTP endpoints natively.
**Justification**: Industry standard for Node.js. Allows for incredibly fast, parallelized test execution.

### **Dynamic Idempotency Keys in E2E Tests**
**Decision**: Appending `Date.now()` to idempotency keys and employee IDs in `resilience.integration.spec.ts`.
**Justification**: Because the SQLite database is persisted to disk during tests, hardcoded idempotency keys caused state collisions across subsequent `npm run test` executions. Dynamic keys ensure total test isolation and determinism without requiring full database drop/syncs between suite runs.

### **Targeted Coverage Completeness (94.5%)**
**Decision**: Expanded tests to explicitly cover bootstrap, filters, interceptors, and edge-case exceptions.
**Justification**: Production systems must prove their behavior under duress. We explicitly mock `QueryRunner.save` to throw simulated database failures, ensuring our `catch` blocks correctly trigger `rollbackTransaction()`.

---

## 🧩 Minor Utility Decisions

### **Extracted `calculateDays` Utility**
**Decision**: Extracted all date-math into a single, pure function `calculateDays(start, end)`.
**Justification**: Native JavaScript `Date` objects are notorious for timezone drift and daylight saving time bugs. By utilizing an explicit mathematical formula on `YYYY-MM-DD` strings `floor((end - start) / 86400000) + 1`, we guarantee an inclusive date range that is 100% deterministic regardless of the server's local timezone configuration.

### **Global Exception Filter & Transform Interceptor**
**Decision**: Implemented `AllExceptionsFilter` and `TransformInterceptor`.
**Justification**: Standardizes the HTTP boundary. Ensures every successful response is uniformly wrapped in a `{ data, statusCode, timestamp }` object, and every failure (even unhandled 500s) gracefully degrades into a structured JSON error payload, preventing stack trace leakage to the client.

---

<div align="center">

*This document serves as the immutable architectural contract for the Time-Off Orchestrator.*

</div>
