import { Module } from '@nestjs/common';
import { TimeOffController } from './time-off.controller';
import { TimeOffService } from './time-off.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeOffRequest } from './entities/time-off-request.entity';
import { BalanceModule } from '../balance/balance.module';
import { HcmIntegrationModule } from '../hcm-integration/hcm-integration.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TimeOffRequest]),
    BalanceModule,
    HcmIntegrationModule
  ],
  controllers: [TimeOffController],
  providers: [TimeOffService],
})
export class TimeOffModule {}
