import { Test, TestingModule } from '@nestjs/testing';
import { BalanceService } from './balance.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Balance } from './entities/balance.entity';

describe('BalanceService', () => {
  let service: BalanceService;
  let mockRepo: any;

  const baseBalance = (): Balance => ({
    id: 'bal-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    totalDays: 20,
    usedDays: 5,
    pendingDays: 3,
    lastSyncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    // manager stub used inside the transaction callback
    const txManager = {
      findOne: jest.fn().mockResolvedValue(baseBalance()),
      create: jest.fn().mockImplementation((_entity: any, data: any) => ({ ...data })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
    };

    mockRepo = {
      findOne: jest.fn().mockResolvedValue(baseBalance()),
      create: jest.fn().mockImplementation((data: any) => ({ ...data })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      // Provide the manager.transaction shim so upsertFromHcm works
      manager: {
        transaction: jest.fn().mockImplementation((cb: (mgr: any) => Promise<any>) => cb(txManager)),
      },
    };

    // Expose txManager on mockRepo so individual tests can override its behaviour
    (mockRepo as any).txManager = txManager;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceService,
        { provide: getRepositoryToken(Balance), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<BalanceService>(BalanceService);
    // Suppress console output during tests, but allow spy to track it
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});
  });

  it('updatePending increments pendingDays by correct amount', async () => {
    const result = await service.updatePending('emp-1', 'loc-1', 5);
    expect(result.pendingDays).toBe(8); // 3 + 5
  });

  it('approvePending decrements pendingDays only (does NOT increment usedDays)', async () => {
    const result = await service.approvePending('emp-1', 'loc-1', 3);
    expect(result.pendingDays).toBe(0); // 3 - 3
    expect(result.usedDays).toBe(5);    // unchanged — HCM-owned
  });

  it('rejectPending floors pendingDays at 0 (never negative)', async () => {
    const result = await service.rejectPending('emp-1', 'loc-1', 999);
    expect(result.pendingDays).toBe(0);
  });

  it('upsertFromHcm overwrites totalDays and usedDays, preserves pendingDays', async () => {
    const result = await service.upsertFromHcm('emp-1', 'loc-1', 25, 10);
    expect(result.totalDays).toBe(25);
    expect(result.usedDays).toBe(10);
    expect(result.pendingDays).toBe(3); // preserved
  });

  it('upsertFromHcm clamps pendingDays when invariant violated', async () => {
    // totalDays=10, usedDays=9, existing pendingDays=3 → 9+3=12 > 10 → clamp to max(0, 10-9)=1
    const result = await service.upsertFromHcm('emp-1', 'loc-1', 10, 9);
    expect(result.pendingDays).toBe(1);
    expect(result.totalDays).toBe(10);
    expect(result.usedDays).toBe(9);
    expect(service['logger'].warn).toHaveBeenCalledWith(
      expect.stringContaining('BALANCE_DRIFT_ALERT: employee=emp-1 location=loc-1 pendingDays clamped from 3 to 1 (totalDays=10, usedDays=9)')
    );
  });
});
