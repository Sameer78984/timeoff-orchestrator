import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { HcmIntegrationModule } from '../hcm-integration/hcm-integration.module';
import { BalanceModule } from '../balance/balance.module';

@Module({
  imports: [HcmIntegrationModule, BalanceModule],
  providers: [SyncService],
  controllers: [SyncController]
})
export class SyncModule {}
