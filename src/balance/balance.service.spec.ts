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
    const txManager = {
      findOne: jest.fn().mockResolvedValue(baseBalance()),
      create: jest.fn().mockImplementation((_entity: any, data: any) => ({ ...data })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
    };

    mockRepo = {
      findOne: jest.fn().mockResolvedValue(baseBalance()),
      create: jest.fn().mockImplementation((data: any) => ({ ...data })),
      save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      manager: {
        transaction: jest.fn().mockImplementation((cb: (mgr: any) => Promise<any>) => cb(txManager)),
      },
    };

    (mockRepo as any).txManager = txManager;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceService,
        { provide: getRepositoryToken(Balance), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<BalanceService>(BalanceService);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updatePending increments pendingDays', async () => {
    const result = await service.updatePending('emp-1', 'loc-1', 5);
    expect(result.pendingDays).toBe(8);
  });

  it('getBalance auto-provisions if not found', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    const result = await service.getBalance('new-emp', 'loc-1');
    expect(result.employeeId).toBe('new-emp');
    expect(result.totalDays).toBe(20);
    expect(mockRepo.create).toHaveBeenCalled();
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('approvePending decrements pendingDays', async () => {
    const result = await service.approvePending('emp-1', 'loc-1', 3);
    expect(result.pendingDays).toBe(0);
  });

  it('rejectPending floors pendingDays at 0', async () => {
    const result = await service.rejectPending('emp-1', 'loc-1', 999);
    expect(result.pendingDays).toBe(0);
  });

  describe('upsertFromHcm', () => {
    it('overwrites totalDays and usedDays', async () => {
      const result = await service.upsertFromHcm('emp-1', 'loc-1', 25, 10);
      expect(result.totalDays).toBe(25);
      expect(result.usedDays).toBe(10);
      expect(result.pendingDays).toBe(3);
    });

    it('clamps pendingDays when invariant violated', async () => {
      const result = await service.upsertFromHcm('emp-1', 'loc-1', 10, 9);
      expect(result.pendingDays).toBe(1);
    });

    it('creates new balance if not found', async () => {
      mockRepo.txManager.findOne.mockResolvedValue(null);
      const result = await service.upsertFromHcm('new-emp', 'loc-1', 30, 0);
      expect(result.employeeId).toBe('new-emp');
      expect(result.totalDays).toBe(30);
      expect(mockRepo.txManager.create).toHaveBeenCalled();
    });
  });
});
