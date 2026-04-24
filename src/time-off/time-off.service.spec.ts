import { Test, TestingModule } from '@nestjs/testing';
import { TimeOffService } from './time-off.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TimeOffRequest, TimeOffStatus } from './entities/time-off-request.entity';
import { BalanceService } from '../balance/balance.service';
import { HcmIntegrationService } from '../hcm-integration/hcm-integration.service';
import { AuditService } from '../audit/audit.service';
import { DataSource } from 'typeorm';
import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';

describe('TimeOffService', () => {
  let service: TimeOffService;
  let balanceService: Partial<BalanceService>;
  let hcmIntegrationService: Partial<HcmIntegrationService>;
  let auditService: Partial<AuditService>;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
      save: jest.fn().mockImplementation((req) => Promise.resolve({ ...req, id: 'req-1' })),
    },
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
  };

  const mockRepository = {
    create: jest.fn().mockImplementation(req => req),
    save: jest.fn().mockImplementation(req => req),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockImplementation(({ where: { id } }) => Promise.resolve({
      id,
      status: TimeOffStatus.PENDING_MANAGER_APPROVAL,
      employeeId: 'emp1',
      locationId: 'loc1',
      startDate: '2026-05-01',
      endDate: '2026-05-05'
    })),
  };

  beforeEach(async () => {
    balanceService = {
      getBalance: jest.fn().mockResolvedValue({ totalDays: 20, usedDays: 0, pendingDays: 0 }),
      updatePending: jest.fn().mockResolvedValue({}),
      approvePending: jest.fn().mockResolvedValue({}),
      rejectPending: jest.fn().mockResolvedValue({}),
    };

    hcmIntegrationService = {
      validateTimeOff: jest.fn().mockResolvedValue(true),
    };

    auditService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeOffService,
        { provide: getRepositoryToken(TimeOffRequest), useValue: mockRepository },
        { provide: BalanceService, useValue: balanceService },
        { provide: HcmIntegrationService, useValue: hcmIntegrationService },
        { provide: AuditService, useValue: auditService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<TimeOffService>(TimeOffService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should halt request at PENDING_MANAGER_APPROVAL successfully', async () => {
    const res = await service.requestTimeOff({
      employeeId: 'emp1', locationId: 'loc1', startDate: '2026-05-01', endDate: '2026-05-05'
    });
    expect(res.status).toBe(TimeOffStatus.PENDING_MANAGER_APPROVAL);
    expect(auditService.log).toHaveBeenCalled();
  });

  it('should throw BadRequest if insufficient balance', async () => {
    balanceService.getBalance = jest.fn().mockResolvedValue({ totalDays: 4, usedDays: 0, pendingDays: 0 }); // request is 5 days
    await expect(service.requestTimeOff({
      employeeId: 'emp1', locationId: 'loc1', startDate: '2026-05-01', endDate: '2026-05-05'
    })).rejects.toThrow(BadRequestException);
  });

  it('manager approval should trigger HCM validation and output APPROVED', async () => {
    const res = await service.approveByManager('req-1');
    expect(hcmIntegrationService.validateTimeOff).toHaveBeenCalled();
    expect(balanceService.approvePending).toHaveBeenCalled();
    expect(res.status).toBe(TimeOffStatus.APPROVED);
  });

  it('should fallback to PENDING_HCM_VALIDATION if HCM throws error during approval', async () => {
    hcmIntegrationService.validateTimeOff = jest.fn().mockRejectedValue(new Error('HCM Error'));
    await expect(service.approveByManager('req-1')).rejects.toThrow(HttpException);
  });
});
