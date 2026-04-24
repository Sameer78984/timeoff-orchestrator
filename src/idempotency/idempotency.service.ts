import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdempotencyRecord } from './entities/idempotency-record.entity';
import * as crypto from 'crypto';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    @InjectRepository(IdempotencyRecord)
    private readonly idempotencyRepository: Repository<IdempotencyRecord>,
  ) {}

  generateHash(payload: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  async checkOrRecord(key: string, payload: any): Promise<any | null> {
    const payloadHash = this.generateHash(payload);
    
    // First try to find it
    const existing = await this.idempotencyRepository.findOne({ where: { key } });
    if (existing) {
      if (existing.requestPayloadHash !== payloadHash) {
        this.logger.warn(`Idempotency key ${key} reused with different payload`);
        throw new ConflictException('Idempotency key already used with a different payload');
      }
      this.logger.log(`Idempotency hit for key ${key}. Returning cached response.`);
      return existing.responseData;
    }

    return null;
  }

  async saveResult(key: string, payload: any, responseData: any): Promise<void> {
    try {
      const payloadHash = this.generateHash(payload);
      const record = this.idempotencyRepository.create({
        key,
        requestPayloadHash: payloadHash,
        responseData,
      });
      await this.idempotencyRepository.save(record);
    } catch (error) {
      // Typically a unique constraint violation if concurrent request won
      this.logger.error(`Failed to save idempotency result for key ${key}`, error.stack);
    }
  }
}
