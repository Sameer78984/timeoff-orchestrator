import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as requestSupertest from 'supertest';
import { AppModule } from './app.module';
import { ExpiryService } from './scheduler/expiry.service';
import { HcmIntegrationService } from './hcm-integration/hcm-integration.service';

const request = (requestSupertest as any).default || requestSupertest;

describe('Integration Tests', () => {
  let app: INestApplication;
  let hcmService: HcmIntegrationService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    hcmService = app.get(HcmIntegrationService);
    hcmService.setErrorRate(0); // deterministic tests
  });

  const runId = Date.now().toString();

  afterAll(async () => {
    await app.close();
  });

  describe('Golden Path: Create → Approve → Verify Balance', () => {
    const employeeId = `emp-golden-${runId}`;
    const locationId = 'loc-golden';
    let requestId: string;

    it('Step 1: Create time-off request', async () => {
      const res = await request(app.getHttpServer())
        .post('/time-off/request')
        .set('Idempotency-Key', `golden-key-${runId}`)
        .send({ employeeId, locationId, startDate: '2026-06-01', endDate: '2026-06-03' })
        .expect(201);

      expect(res.body.status).toBe('PENDING_MANAGER_APPROVAL');
      requestId = res.body.id;
    });

    it('Step 2: Approve request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/time-off/${requestId}/approve`);
      expect(res.status).toBe(200);

      expect(res.body.status).toBe('APPROVED');
    });

    it('Step 3: Verify balance — pendingDays released', async () => {
      const res = await request(app.getHttpServer())
        .get(`/balance/${employeeId}/${locationId}`)
        .expect(200);

      expect(res.body.pendingDays).toBe(0);
      // usedDays remains 0 — HCM-owned, only modified by sync
      expect(res.body.usedDays).toBe(0);
    });
  });

  describe('Reject Path: Create → Reject → Verify Balance', () => {
    const employeeId = `emp-reject-${runId}`;
    const locationId = 'loc-reject';
    let requestId: string;

    it('Create request', async () => {
      const res = await request(app.getHttpServer())
        .post('/time-off/request')
        .set('Idempotency-Key', `reject-key-${runId}`)
        .send({ employeeId, locationId, startDate: '2026-07-01', endDate: '2026-07-05' })
        .expect(201);

      requestId = res.body.id;
    });

    it('Reject request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/time-off/${requestId}/reject`);
      expect(res.status).toBe(200);

      expect(res.body.status).toBe('REJECTED');
    });

    it('Verify balance — pendingDays returned to 0', async () => {
      const res = await request(app.getHttpServer())
        .get(`/balance/${employeeId}/${locationId}`)
        .expect(200);

      expect(res.body.pendingDays).toBe(0);
    });
  });

  describe('Idempotency', () => {
    const key = `idem-test-key-${runId}`;
    const payload = {
      employeeId: `emp-idem-${runId}`, locationId: 'loc-idem',
      startDate: '2026-08-01', endDate: '2026-08-03',
    };

    it('first request creates normally', async () => {
      await request(app.getHttpServer())
        .post('/time-off/request')
        .set('Idempotency-Key', key)
        .send(payload)
        .expect(201);
    });

    it('duplicate key + same payload returns cached response', async () => {
      const res = await request(app.getHttpServer())
        .post('/time-off/request')
        .set('Idempotency-Key', key)
        .send(payload)
        .expect(201);

      expect(res.body.status).toBe('PENDING_MANAGER_APPROVAL');
    });

    it('duplicate key + different payload returns 409', async () => {
      await request(app.getHttpServer())
        .post('/time-off/request')
        .set('Idempotency-Key', key)
        .send({ ...payload, employeeId: 'different-emp' })
        .expect(409);
    });
  });

  describe('TTL Expiry', () => {
    it('expiry cron runs without error', async () => {
      const expiryService = app.get(ExpiryService);
      await expiryService.handlePendingExpiries();
      expect(true).toBe(true);
    });
  });
});
