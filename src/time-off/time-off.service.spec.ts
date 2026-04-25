import { Test, TestingModule } from '@nestjs/testing';
import { TimeOffService } from './time-off.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TimeOffRequest, TimeOffStatus } from './entities/time-off-request.entity';
import { BalanceService } from '../balance/balance.service';
import { HcmIntegrationService } from '../hcm-integration/hcm-integration.service';
import { AuditService } from '../audit/audit.service';
import { Balance } from '../balance/entities/balance.entity';
import { DataSource } from 'typeorm';
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';

describe('TimeOffService', () => {
  let service: TimeOffService;
  let hcmIntegrationService: Partial<HcmIntegrationService>;
  let auditService: Partial<AuditService>;

  const mockBalance: Balance = {
    id: 'bal-1',
    employeeId: 'emp-1',
    locationId: 'loc-1',
    totalDays: 20,
    usedDays: 0,
    pendingDays: 0,
    lastSyncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const buildQueryRunner = (overrides: any = {}) => ({
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(overrides.overlaps ?? []),
      }),
      findOne: jest.fn().mockImplementation((entity, opts) => {
        if (entity === Balance) return Promise.resolve({ ...mockBalance, ...(overrides.balance ?? {}) });
        if (entity === TimeOffRequest) {
          return Promise.resolve(overrides.request !== undefined ? overrides.request : {
            id: 'req-1',
            employeeId: 'emp-1',
            locationId: 'loc-1',
            startDate: '2026-05-01',
            endDate: '2026-05-05',
            status: overrides.existingStatus ?? TimeOffStatus.PENDING_MANAGER_APPROVAL,
          });
        }
        return Promise.resolve(null);
      }),
      create: jest.fn().mockImplementation((entity, data) => ({ ...data })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...entity, id: entity.id ?? 'req-1' })),
    },
  });

  const setup = async (overrides: any = {}) => {
    const mockQR = buildQueryRunner(overrides);

    hcmIntegrationService = {
      validateTimeOff: jest.fn().mockResolvedValue(overrides.hcmResult ?? true),
    };
    auditService = { log: jest.fn() };

    const mockRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockImplementation(({ where: { id } }) =>
        Promise.resolve(overrides.findOneResult !== undefined ? overrides.findOneResult : {
          id,
          employeeId: 'emp-1',
          locationId: 'loc-1',
          startDate: '2026-05-01',
          endDate: '2026-05-05',
          status: overrides.existingStatus ?? TimeOffStatus.PENDING_MANAGER_APPROVAL,
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeOffService,
        { provide: getRepositoryToken(TimeOffRequest), useValue: mockRepository },
        { provide: BalanceService, useValue: {} },
        { provide: HcmIntegrationService, useValue: hcmIntegrationService },
        { provide: AuditService, useValue: auditService },
        { provide: DataSource, useValue: { createQueryRunner: jest.fn().mockReturnValue(mockQR) } },
      ],
    }).compile();

    service = module.get<TimeOffService>(TimeOffService);
    return { mockQR };
  };

  // --- Request Creation ---

  it('should return pending approvals', async () => {
    const { mockQR } = await setup();
    const result = await service.getPendingApprovals();
    expect(result).toEqual([]);
  });

  it('should create request in PENDING_MANAGER_APPROVAL and reserve pendingDays', async () => {
    const { mockQR } = await setup();
    const result = await service.requestTimeOff({
      employeeId: 'emp-1', locationId: 'loc-1', startDate: '2026-05-01', endDate: '2026-05-05',
    });
    expect(result.status).toBe(TimeOffStatus.PENDING_MANAGER_APPROVAL);
    expect(mockQR.commitTransaction).toHaveBeenCalled();
    expect(mockQR.manager.save).toHaveBeenCalled();
  });

  it('should throw BadRequest if insufficient balance', async () => {
    await setup({ balance: { pendingDays: 18 } }); // 20 - 0 - 18 = 2 available, requesting 5
    await expect(service.requestTimeOff({
      employeeId: 'emp-1', locationId: 'loc-1', startDate: '2026-05-01', endDate: '2026-05-05',
    })).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequest if overlapping request exists', async () => {
    await setup({ overlaps: [{ id: 'existing' }] });
    await expect(service.requestTimeOff({
      employeeId: 'emp-1', locationId: 'loc-1', startDate: '2026-05-01', endDate: '2026-05-05',
    })).rejects.toThrow(BadRequestException);
  });

  // --- Approve ---

  it('should transition to APPROVED when HCM returns true', async () => {
    await setup({ hcmResult: true });
    const result = await service.approveByManager('req-1');
    expect(result.status).toBe(TimeOffStatus.APPROVED);
    expect(hcmIntegrationService.validateTimeOff).toHaveBeenCalled();
  });

  it('should transition to REJECTED when HCM returns false', async () => {
    await setup({ hcmResult: false });
    const result = await service.approveByManager('req-1');
    expect(result.status).toBe(TimeOffStatus.REJECTED);
  });

  it('should throw 502 and NOT change state when HCM throws', async () => {
    await setup();
    (hcmIntegrationService.validateTimeOff as jest.Mock).mockRejectedValue(new Error('HCM down'));
    await expect(service.approveByManager('req-1')).rejects.toThrow(HttpException);
  });

  it('should throw 400 when approving a non-PENDING_MANAGER_APPROVAL request', async () => {
    await setup({ existingStatus: TimeOffStatus.APPROVED });
    await expect(service.approveByManager('req-1')).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequest if state changes concurrently during HCM call', async () => {
    const { mockQR } = await setup({ hcmResult: true, existingStatus: TimeOffStatus.PENDING_MANAGER_APPROVAL });
    // The first findOne returns PENDING, but we need the second findOne inside TX to return APPROVED
    // We can simulate this by mocking queryRunner.manager.findOne to return APPROVED
    mockQR.manager.findOne.mockImplementation((entity) => {
      if (entity === TimeOffRequest) {
        return Promise.resolve({ id: 'req-1', status: TimeOffStatus.APPROVED });
      }
      return Promise.resolve(null);
    });

    await expect(service.approveByManager('req-1')).rejects.toThrow(BadRequestException);
    expect(mockQR.rollbackTransaction).toHaveBeenCalled();
  });

  it('should rollback transaction if a database error occurs during approval', async () => {
    const { mockQR } = await setup({ hcmResult: true });
    mockQR.manager.save.mockRejectedValue(new Error('DB Error'));

    await expect(service.approveByManager('req-1')).rejects.toThrow('DB Error');
    expect(mockQR.rollbackTransaction).toHaveBeenCalled();
  });

  it('should throw NotFoundException if balance is not found during approval', async () => {
    const { mockQR } = await setup({ hcmResult: true });
    // Make findOne return null when querying for Balance inside TX
    mockQR.manager.findOne.mockImplementation((entity) => {
      if (entity === TimeOffRequest) {
        return Promise.resolve({ id: 'req-1', employeeId: 'emp-1', locationId: 'loc-1', status: TimeOffStatus.PENDING_MANAGER_APPROVAL, startDate: '2026-05-01', endDate: '2026-05-05' });
      }
      return Promise.resolve(null); // Balance returns null
    });

    await expect(service.approveByManager('req-1')).rejects.toThrow(NotFoundException);
    expect(mockQR.rollbackTransaction).toHaveBeenCalled();
  });

  // --- Reject ---

  it('should transition to REJECTED and release pendingDays', async () => {
    await setup();
    const result = await service.rejectByManager('req-1');
    expect(result.status).toBe(TimeOffStatus.REJECTED);
  });

  it('should throw NotFoundException if balance is not found during rejection', async () => {
    const { mockQR } = await setup();
    mockQR.manager.findOne.mockImplementation((entity) => {
      if (entity === TimeOffRequest) {
        return Promise.resolve({ id: 'req-1', employeeId: 'emp-1', locationId: 'loc-1', status: TimeOffStatus.PENDING_MANAGER_APPROVAL, startDate: '2026-05-01', endDate: '2026-05-05' });
      }
      return Promise.resolve(null); // Balance returns null
    });

    await expect(service.rejectByManager('req-1')).rejects.toThrow(NotFoundException);
    expect(mockQR.rollbackTransaction).toHaveBeenCalled();
  });

  it('should throw 400 when rejecting a non-PENDING_MANAGER_APPROVAL request', async () => {
    await setup({ existingStatus: TimeOffStatus.REJECTED });
    await expect(service.rejectByManager('req-1')).rejects.toThrow(BadRequestException);
  });

  // --- Not Found ---

  it('should throw 404 when request does not exist', async () => {
    await setup({ findOneResult: null });
    await expect(service.approveByManager('nonexistent')).rejects.toThrow(NotFoundException);
  });
});
