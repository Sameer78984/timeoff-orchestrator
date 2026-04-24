import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employee/entities/employee.entity';
import { Balance } from '../balance/entities/balance.entity';
import { TimeOffRequest } from '../time-off/entities/time-off-request.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { IdempotencyRecord } from '../idempotency/entities/idempotency-record.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'timeoff.sqlite',
      entities: [Employee, Balance, TimeOffRequest, AuditLog, IdempotencyRecord],
      synchronize: true, // Use only in dev, but fine for this requested production-grade mockup
      autoLoadEntities: true,
      logging: false,
    }),
  ],
})
export class DatabaseModule {}
