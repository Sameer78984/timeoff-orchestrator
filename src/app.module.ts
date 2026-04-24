import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module';
import { HcmIntegrationModule } from './hcm-integration/hcm-integration.module';
import { EmployeeModule } from './employee/employee.module';
import { BalanceModule } from './balance/balance.module';
import { TimeOffModule } from './time-off/time-off.module';
import { SyncModule } from './sync/sync.module';
import { ConfigModule } from './config/config.module';
import { AuditModule } from './audit/audit.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    DatabaseModule,
    AuditModule,
    IdempotencyModule,
    ScheduleModule.forRoot(),
    SchedulerModule,
    HcmIntegrationModule,
    EmployeeModule,
    BalanceModule,
    TimeOffModule,
    SyncModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
