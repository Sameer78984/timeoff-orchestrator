import { Test, TestingModule } from '@nestjs/testing';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

describe('SyncController', () => {
  let controller: SyncController;
  let service: SyncService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        {
          provide: SyncService,
          useValue: {
            reconcileBalances: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SyncController>(SyncController);
    service = module.get<SyncService>(SyncService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('syncBalances', () => {
    it('should call reconcileBalances', async () => {
      const mockResult = { updated: 1, failed: 0 };
      (service.reconcileBalances as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.syncBalances('loc-1');
      expect(result).toEqual(mockResult);
      expect(service.reconcileBalances).toHaveBeenCalledWith('loc-1');
    });

    it('should propagate service errors', async () => {
      (service.reconcileBalances as jest.Mock).mockRejectedValue(new Error('Sync failed'));

      await expect(controller.syncBalances('loc-1')).rejects.toThrow('Sync failed');
    });
  });
});
