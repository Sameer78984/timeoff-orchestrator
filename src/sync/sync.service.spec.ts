import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { HcmIntegrationService } from '../hcm-integration/hcm-integration.service';
import { BalanceService } from '../balance/balance.service';

describe('SyncService', () => {
  let service: SyncService;
  let hcmService: Partial<HcmIntegrationService>;
  let balanceService: Partial<BalanceService>;

  beforeEach(async () => {
    hcmService = {
      fetchBatchBalances: jest.fn().mockResolvedValue([
        { employeeId: 'emp-1', totalDays: 20, usedDays: 3 },
        { employeeId: 'emp-2', totalDays: 15, usedDays: 5 },
      ]),
    };

    balanceService = {
      upsertFromHcm: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: HcmIntegrationService, useValue: hcmService },
        { provide: BalanceService, useValue: balanceService },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  it('calls upsertFromHcm once per employee in batch', async () => {
    const result = await service.reconcileBalances('loc-1');
    expect(balanceService.upsertFromHcm).toHaveBeenCalledTimes(2);
    expect(balanceService.upsertFromHcm).toHaveBeenCalledWith('emp-1', 'loc-1', 20, 3);
    expect(balanceService.upsertFromHcm).toHaveBeenCalledWith('emp-2', 'loc-1', 15, 5);
    expect(result).toEqual({ updated: 2, failed: 0 });
  });

  it('handles partial failures without aborting batch', async () => {
    (balanceService.upsertFromHcm as jest.Mock)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('DB error'));

    const result = await service.reconcileBalances('loc-1');
    expect(result).toEqual({ updated: 1, failed: 1 });
  });

  it('handles empty HCM response gracefully', async () => {
    (hcmService.fetchBatchBalances as jest.Mock).mockResolvedValue([]);
    const result = await service.reconcileBalances('loc-1');
    expect(result).toEqual({ updated: 0, failed: 0 });
  });
});
