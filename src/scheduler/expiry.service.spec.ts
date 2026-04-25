import { Test, TestingModule } from '@nestjs/testing';
import { ExpiryService } from './expiry.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TimeOffRequest, TimeOffStatus } from '../time-off/entities/time-off-request.entity';
import { BalanceService } from '../balance/balance.service';
import { AuditService } from '../audit/audit.service';

describe('ExpiryService', () => {
  let service: ExpiryService;
  let mockRepository: any;
  let mockBalanceService: any;
  let mockAuditService: any;

  beforeEach(async () => {
    // txManager is used inside the manager.transaction callback
    const txManager = {
      save: jest.fn().mockImplementation((_entity: any, obj: any) => Promise.resolve(obj)),
    };

    mockRepository = {
      find: jest.fn(),
      save: jest.fn(),
      // shim so ExpiryService's manager.transaction(...) call resolves properly
      manager: {
        transaction: jest.fn().mockImplementation((cb: (mgr: any) => Promise<any>) => cb(txManager)),
      },
    };

    // Expose txManager so individual tests can override its behaviour
    (mockRepository as any).txManager = txManager;

    mockBalanceService = {
      rejectPending: jest.fn(),
    };

    mockAuditService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpiryService,
        { provide: getRepositoryToken(TimeOffRequest), useValue: mockRepository },
        { provide: BalanceService, useValue: mockBalanceService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<ExpiryService>(ExpiryService);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => {});
    jest.spyOn(service['logger'], 'log').mockImplementation(() => {});
    jest.spyOn(service['logger'], 'debug').mockImplementation(() => {});
  });

  it('should expire old requests', async () => {
    const oldDate = new Date();
    oldDate.setMinutes(oldDate.getMinutes() - 40); // Older than 30 mins

    const mockRequest = {
      id: 'req-1',
      employeeId: 'emp-1',
      locationId: 'loc-1',
      startDate: '2026-05-01',
      endDate: '2026-05-03', // 3 days
      status: TimeOffStatus.PENDING_MANAGER_APPROVAL,
      createdAt: oldDate,
    };

    mockRepository.find.mockResolvedValue([mockRequest]);

    await service.handlePendingExpiries();

    const txManager = (mockRepository as any).txManager;
    expect(mockRequest.status).toBe(TimeOffStatus.EXPIRED);
    expect(txManager.save).toHaveBeenCalledWith(TimeOffRequest, mockRequest);
    expect(mockBalanceService.rejectPending).toHaveBeenCalledWith('emp-1', 'loc-1', 3);
    expect(mockAuditService.log).toHaveBeenCalled();
  });

  it('should skip fresh requests', async () => {
    const freshDate = new Date();
    freshDate.setMinutes(freshDate.getMinutes() - 10); // Not older than 30 mins

    const mockRequest = {
      id: 'req-2',
      startDate: '2026-05-01',
      endDate: '2026-05-03',
      createdAt: freshDate,
    };

    mockRepository.find.mockResolvedValue([mockRequest]);

    await service.handlePendingExpiries();

    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully during expiry', async () => {
    const oldDate = new Date();
    oldDate.setMinutes(oldDate.getMinutes() - 40);

    const mockRequest = {
      id: 'req-error',
      startDate: '2026-05-01',
      endDate: '2026-05-03',
      createdAt: oldDate,
    };

    mockRepository.find.mockResolvedValue([mockRequest]);
    // Make the transaction itself throw to simulate a DB failure
    mockRepository.manager.transaction.mockRejectedValue(new Error('DB failure'));

    await service.handlePendingExpiries();

    expect(service['logger'].error).toHaveBeenCalled();
  });
});
