import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  /**
   * Performs an asynchronous fire-and-forget log of a system event.
   * This method is intentionally non-blocking to ensure business logic performance.
   * 
   * **Side Effects:**
   * - Database: Writes a new record to the AuditLog table.
   * 
   * **Error Handling:**
   * - Failures in logging are caught and logged as system errors but do not
   *   impact the primary caller's execution flow.
   * - Suppresses specific SQLite "closed handle" errors in test mode to maintain clean CI logs.
   * 
   * @param action The type of audit event (e.g., REQUEST_CREATED, APPROVED).
   * @param employeeId The employee associated with the event.
   * @param timeOffRequestId The specific request associated with the event.
   * @param metadata Optional JSON blob for extra context.
   */
  log(action: AuditAction, employeeId?: string, timeOffRequestId?: string, metadata?: any): void {
    const logEntry = this.auditRepository.create({
      action,
      employeeId,
      timeOffRequestId,
      metadata,
    });

    // Fire-and-forget: do not await the save to prevent blocking the primary request
    this.auditRepository.save(logEntry).catch(err => {
      // Must not crash the application if audit log fails
      if (process.env.NODE_ENV === 'test' && (err.message?.includes('closed') || err.message?.includes('MISUSE'))) {
        return;
      }
      this.logger.error(`Failed to save audit log: ${err.message}`, err.stack);
    });
  }
}
