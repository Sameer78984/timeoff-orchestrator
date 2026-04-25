import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeOffRequest, TimeOffStatus } from '../time-off/entities/time-off-request.entity';
import { BalanceService } from '../balance/balance.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { calculateDays } from '../common/utils/calculate-days';

@Injectable()
export class ExpiryService {
  private readonly logger = new Logger(ExpiryService.name);

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly timeOffRepository: Repository<TimeOffRequest>,
    private readonly balanceService: BalanceService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Background task that runs every minute to expire stale time-off requests.
   * 
   * **Business Rules:**
   * - Only targets requests in PENDING_MANAGER_APPROVAL state.
   * - TTL is currently 30 minutes from creation.
   * 
   * **Side Effects:**
   * - Database: Updates status to EXPIRED.
   * - Database: Rolls back `pendingDays` in the employee's Balance record.
   * - Audit: Logs a REQUEST_EXPIRED event.
   * 
   * **Transaction Safety:**
   * - Each request is processed within its own database transaction (ACID).
   * - If a single request fails to expire, it is skipped and retried in the next cycle.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handlePendingExpiries() {
    this.logger.debug('Running soft reservation expiry job');
    const expiryThreshold = new Date();
    // TRD §7.4: TTL is 30 minutes.
    expiryThreshold.setMinutes(expiryThreshold.getMinutes() - 30);

    // Only expire PENDING_MANAGER_APPROVAL — the only active state holding reservations
    const pendingRequests = await this.timeOffRepository.find({
      where: { status: TimeOffStatus.PENDING_MANAGER_APPROVAL },
    });

    for (const request of pendingRequests) {
      if (request.createdAt < expiryThreshold) {
        try {
          const days = calculateDays(request.startDate, request.endDate);

          // Both writes must be atomic per TRD §7.4: status → EXPIRED + pendingDays rollback.
          // If either write fails the record is left unchanged so the next cron cycle retries.
          await this.timeOffRepository.manager.transaction(async (manager) => {
            request.status = TimeOffStatus.EXPIRED;
            await manager.save(TimeOffRequest, request);
            await this.balanceService.rejectPending(request.employeeId, request.locationId, days);
          });

          this.logger.log(`Expired request ${request.id}: released ${days} pendingDays`);
          this.auditService.log(AuditAction.REQUEST_EXPIRED, request.employeeId, request.id, {
            reason: 'TTL exceeded for PENDING_MANAGER_APPROVAL',
            days,
          });
        } catch (error) {
          // Log failure but continue processing other expired requests
          this.logger.error(`Failed to expire request ${request.id}: ${error.message}`);
        }
      }
    }
  }
}
