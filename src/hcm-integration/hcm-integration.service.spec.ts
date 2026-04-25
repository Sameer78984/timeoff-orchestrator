import { Test, TestingModule } from '@nestjs/testing';
import { HcmIntegrationService } from './hcm-integration.service';
import { InternalServerErrorException } from '@nestjs/common';

describe('HcmIntegrationService', () => {
  let service: HcmIntegrationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HcmIntegrationService],
    }).compile();

    service = module.get<HcmIntegrationService>(HcmIntegrationService);
    service.setErrorRate(0); // disable random failures for deterministic tests
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('validateTimeOff returns true when days <= 20', async () => {
    const result = await service.validateTimeOff('emp-1', 'loc-1', 10);
    expect(result).toBe(true);
  });

  it('validateTimeOff returns false when days > 20', async () => {
    const result = await service.validateTimeOff('emp-1', 'loc-1', 25);
    expect(result).toBe(false);
  });

  it('throws InternalServerError when error rate is 100%', async () => {
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
    service.setErrorRate(1);
    await expect(service.validateTimeOff('emp-1', 'loc-1', 5)).rejects.toThrow(InternalServerErrorException);
  });

  it('fetchBatchBalances returns realistic mock data', async () => {
    const result = await service.fetchBatchBalances('loc-1');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('employeeId');
    expect(result[0]).toHaveProperty('totalDays');
    expect(result[0]).toHaveProperty('usedDays');
  });
});
