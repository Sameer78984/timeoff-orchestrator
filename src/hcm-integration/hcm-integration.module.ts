import { Module } from '@nestjs/common';
import { HcmIntegrationService } from './hcm-integration.service';

@Module({
  providers: [HcmIntegrationService],
  exports: [HcmIntegrationService]
})
export class HcmIntegrationModule {}
