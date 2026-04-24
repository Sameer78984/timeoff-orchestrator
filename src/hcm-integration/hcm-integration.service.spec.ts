import { Test, TestingModule } from '@nestjs/testing';
import { HcmIntegrationService } from './hcm-integration.service';

describe('HcmIntegrationService', () => {
  let service: HcmIntegrationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HcmIntegrationService],
    }).compile();

    service = module.get<HcmIntegrationService>(HcmIntegrationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
