import { Module } from '@nestjs/common';
import { ExpiryService } from './expiry.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeOffRequest } from '../time-off/entities/time-off-request.entity';
import { BalanceModule } from '../balance/balance.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([TimeOffRequest]), BalanceModule, AuditModule],
  providers: [ExpiryService],
})
export class SchedulerModule {}
