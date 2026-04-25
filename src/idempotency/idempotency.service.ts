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

  /**
   * Generates a unique SHA-256 hash for the given request payload.
   * Used to detect if the same idempotency key is being reused with different data.
   * 
   * @param payload The request body to hash.
   * @returns Hex-encoded SHA-256 hash.
   */
  generateHash(payload: any): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  /**
   * Checks if an idempotency key has already been processed.
   * 
   * **Business Rules:**
   * - Key Miss: Returns `null`, allowing the request to proceed.
   * - Key Hit (Same Payload): Returns the cached response data immediately.
   * - Key Hit (Different Payload): Throws `ConflictException` (409) as per TRD.
   * 
   * @param key The Idempotency-Key UUID from headers.
   * @param payload The current request payload to verify against cache.
   * @returns Cached response data or null.
   * @throws ConflictException if the key is reused for a different request.
   */
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

  /**
   * Caches the final result of a successful operation against an idempotency key.
   * 
   * **Side Effects:**
   * - Database: Writes a new record to the IdempotencyRecord table.
   * 
   * **Error Handling:**
   * - Caught errors typically indicate a race condition where a concurrent
   *   request won the write; these are logged but not bubbled.
   * 
   * @param key The Idempotency-Key UUID.
   * @param payload The request payload that generated the result.
   * @param responseData The result to cache for future retries.
   */
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
