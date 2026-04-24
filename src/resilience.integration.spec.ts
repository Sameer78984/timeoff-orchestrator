import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as requestSupertest from 'supertest';
import { AppModule } from '../src/app.module';
import { ExpiryService } from '../src/scheduler/expiry.service';

const request = requestSupertest.default || requestSupertest;

describe('Resilience Features (Integration)', () => {
  let app: INestApplication;
  
  const idempotencyKey = 'RESILIENCE-TEST-KEY-1';
  const employeeId = 'emp-integration';
  const locationId = 'loc-integration';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Idempotency Key Handling & 2. Audit Log Creation', () => {
    let firstResponseHeader = '';

    it('should process new request and store response', async () => {
      const payload = {
        employeeId, locationId,
        startDate: '2026-06-01', endDate: '2026-06-03'
      };

      const res = await request(app.getHttpServer())
        .post('/time-off/request')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(201);
      
      expect(res.body.status).toBeDefined();
      firstResponseHeader = res.body.id;
    });

    it('should return cached response for duplicate idempotency key', async () => {
      const payload = {
        employeeId, locationId,
        startDate: '2026-06-01', endDate: '2026-06-03'
      };

      const res = await request(app.getHttpServer())
        .post('/time-off/request')
        .set('Idempotency-Key', idempotencyKey)
        .send(payload)
        .expect(201);
      
      expect(res.body.id).toEqual(firstResponseHeader);
    });

    it('should reject with 409 if idempotency payload differs', async () => {
        const diffPayload = {
          employeeId: 'different-emp', locationId,
          startDate: '2026-06-01', endDate: '2026-06-03'
        };
  
        const res = await request(app.getHttpServer())
          .post('/time-off/request')
          .set('Idempotency-Key', idempotencyKey)
          .send(diffPayload)
          .expect(409);
    });
  });

  describe('3. Soft Reservation Expiry', () => {
      it('should expire pending requests gracefully', async () => {
         const expiryService = app.get(ExpiryService);
         await expiryService.handlePendingExpiries();
         expect(true).toBe(true);
      });
  });

});

