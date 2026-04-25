import { Test, TestingModule } from '@nestjs/testing';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';
import { NotFoundException } from '@nestjs/common';

describe('BalanceController', () => {
  let controller: BalanceController;
  let service: BalanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BalanceController],
      providers: [
        {
          provide: BalanceService,
          useValue: {
            getBalance: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<BalanceController>(BalanceController);
    service = module.get<BalanceService>(BalanceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getBalance', () => {
    it('should return balance for an employee', async () => {
      const mockBalance = { employeeId: 'emp-1', totalDays: 20 };
      (service.getBalance as jest.Mock).mockResolvedValue(mockBalance);

      const result = await controller.getBalance('emp-1', 'loc-1');
      expect(result).toEqual(mockBalance);
      expect(service.getBalance).toHaveBeenCalledWith('emp-1', 'loc-1');
    });

    it('should throw NotFoundException if balance is not found', async () => {
      // Note: BalanceService.getBalance auto-provisions, but we test the 404 path for robustness
      (service.getBalance as jest.Mock).mockResolvedValue(null);

      // We need to update the controller to throw if we want this to pass
      await expect(controller.getBalance('emp-1', 'loc-1')).rejects.toThrow(NotFoundException);
    });

    it('should propagate service errors', async () => {
      (service.getBalance as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(controller.getBalance('emp-1', 'loc-1')).rejects.toThrow('DB error');
    });
  });
});
