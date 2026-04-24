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
   * Fire-and-forget logging. Non-blocking.
   */
  log(action: AuditAction, employeeId?: string, timeOffRequestId?: string, metadata?: any): void {
    const logEntry = this.auditRepository.create({
      action,
      employeeId,
      timeOffRequestId,
      metadata,
    });

    this.auditRepository.save(logEntry).catch(err => {
      // Must not crash the application if audit log fails
      this.logger.error(`Failed to save audit log: ${err.message}`, err.stack);
    });
  }
}
