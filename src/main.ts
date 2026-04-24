import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const goldenPathDescription = `
## ⚙️ Time-Off Orchestrator Microservice

A NestJS microservice managing employee time-off requests with eventual consistency against an external HCM system.
It implements pessimistic locking, idempotency, a multi-stage manager approval workflow, and TTL-based soft expiry.

---

## 🧪 2-Minute System Demo (Golden Path)

Execute this sequence in order to exercise the complete request lifecycle end-to-end:

| Step | Action | Endpoint |
|------|--------|----------|
| **1** | Create an employee record | \`POST /employee\` |
| **2** | Fetch their starting balance | \`GET /balance/{employeeId}/{locationId}\` |
| **3** | Submit a time-off request *(requires \`Idempotency-Key\` header)* | \`POST /time-off/request\` |
| **4** | Approve it as a manager → triggers HCM validation | \`PATCH /time-off/{id}/approve\` |
| **5** | Submit a second request, then reject it | \`PATCH /time-off/{id}/reject\` |
| **6** | Force HCM batch reconciliation | \`POST /sync/{locationId}\` |

> **The system is fully testable via Swagger UI without Postman or external scripts. All workflows can be executed end-to-end inside /api/docs.**

---

## 📋 Endpoint Groups

- **Employee Management** — Create and retrieve employee records
- **Balance Service** — Read local cached balance (totalDays / usedDays / pendingDays)
- **Time-Off Workflow** — Submit, approve, reject, and list requests. Core state machine lives here.
- **HCM Sync & Reconciliation** — Trigger batch balance sync from the HCM source of truth

---

## ⚠️ Required Header

\`POST /time-off/request\` requires an \`Idempotency-Key\` header (any UUID string).
Set it under the **Headers** section in the Swagger request form before executing.
`;

  const config = new DocumentBuilder()
    .setTitle('Time-Off Orchestrator Microservice')
    .setDescription(goldenPathDescription)
    .setVersion('2.0')
    .addTag('Employee Management', 'Create and retrieve employee records')
    .addTag('Balance Service', 'Read and inspect local cached balance per employee and location')
    .addTag('Time-Off Workflow', 'Submit, approve, reject, and list time-off requests')
    .addTag('HCM Sync & Reconciliation', 'Trigger and monitor batch HCM balance synchronisation')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'method',
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
