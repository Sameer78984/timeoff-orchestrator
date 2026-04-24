import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyRecord } from './entities/idempotency-record.entity';
import { IdempotencyService } from './idempotency.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecord])],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
