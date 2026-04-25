import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Employee } from '../employee/entities/employee.entity';
import { Balance } from '../balance/entities/balance.entity';
import { TimeOffRequest } from '../time-off/entities/time-off-request.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { IdempotencyRecord } from '../idempotency/entities/idempotency-record.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isTest = process.env.NODE_ENV === 'test';
        return {
          type: 'sqlite',
          database: isTest ? ':memory:' : configService.get<string>('DB_DATABASE', 'timeoff.sqlite'),
          entities: [Employee, Balance, TimeOffRequest, AuditLog, IdempotencyRecord],
          synchronize: true,
          autoLoadEntities: true,
          logging: false,
          // poolSize: 1, // Optional: ensure single connection for sqlite in-memory if needed
        };
      },
    }),
  ],
})
export class DatabaseModule {}
