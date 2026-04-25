import { Test, TestingModule } from '@nestjs/testing';
import { TimeOffController } from './time-off.controller';
import { TimeOffService } from './time-off.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { TimeOffStatus } from './entities/time-off-request.entity';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('TimeOffController', () => {
  let controller: TimeOffController;
  let timeOffService: TimeOffService;
  let idempotencyService: IdempotencyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TimeOffController],
      providers: [
        {
          provide: TimeOffService,
          useValue: {
            requestTimeOff: jest.fn(),
            getPendingApprovals: jest.fn(),
            approveByManager: jest.fn(),
            rejectByManager: jest.fn(),
          },
        },
        {
          provide: IdempotencyService,
          useValue: {
            checkOrRecord: jest.fn(),
            saveResult: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TimeOffController>(TimeOffController);
    timeOffService = module.get<TimeOffService>(TimeOffService);
    idempotencyService = module.get<IdempotencyService>(IdempotencyService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('requestTimeOff', () => {
    const dto = { employeeId: 'emp-1', locationId: 'loc-1', startDate: '2026-05-01', endDate: '2026-05-05' };
    const key = 'key-123';

    it('should throw BadRequestException if Idempotency-Key is missing', async () => {
      await expect(controller.requestTimeOff(dto, '')).rejects.toThrow(BadRequestException);
    });

    it('should return cached response if idempotency hit occurs', async () => {
      const cachedResponse = { id: 'req-1', status: 'PENDING' };
      (idempotencyService.checkOrRecord as jest.Mock).mockResolvedValue(cachedResponse);

      const result = await controller.requestTimeOff(dto, key);
      expect(result).toEqual(cachedResponse);
      expect(idempotencyService.checkOrRecord).toHaveBeenCalledWith(key, dto);
      expect(timeOffService.requestTimeOff).not.toHaveBeenCalled();
    });

    it('should create new request and save result if no idempotency record exists', async () => {
      const newResponse = { id: 'req-2', status: 'PENDING' };
      (idempotencyService.checkOrRecord as jest.Mock).mockResolvedValue(null);
      (timeOffService.requestTimeOff as jest.Mock).mockResolvedValue(newResponse);

      const result = await controller.requestTimeOff(dto, key);
      expect(result).toEqual(newResponse);
      expect(timeOffService.requestTimeOff).toHaveBeenCalledWith(dto);
      expect(idempotencyService.saveResult).toHaveBeenCalledWith(key, dto, newResponse);
    });

    it('should propagate ConflictException from idempotency service', async () => {
      (idempotencyService.checkOrRecord as jest.Mock).mockRejectedValue(new ConflictException());
      await expect(controller.requestTimeOff(dto, key)).rejects.toThrow(ConflictException);
    });
  });

  describe('getPendingApprovals', () => {
    it('should return pending approvals', async () => {
      const approvals = [{ id: 'req-1' }];
      (timeOffService.getPendingApprovals as jest.Mock).mockResolvedValue(approvals);

      const result = await controller.getPendingApprovals();
      expect(result).toEqual(approvals);
    });
  });

  describe('approveRequest', () => {
    it('should approve a request', async () => {
      const expectedResult = { id: 'req-1', status: TimeOffStatus.APPROVED };
      (timeOffService.approveByManager as jest.Mock).mockResolvedValue(expectedResult);

      const result = await controller.approveRequest('req-1');
      expect(result).toEqual(expectedResult);
    });
  });

  describe('rejectRequest', () => {
    it('should reject a request', async () => {
      const expectedResult = { id: 'req-1', status: TimeOffStatus.REJECTED };
      (timeOffService.rejectByManager as jest.Mock).mockResolvedValue(expectedResult);

      const result = await controller.rejectRequest('req-1');
      expect(result).toEqual(expectedResult);
    });
  });
});
