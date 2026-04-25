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

  @Cron(CronExpression.EVERY_MINUTE)
  async handlePendingExpiries() {
    this.logger.debug('Running soft reservation expiry job');
    const expiryThreshold = new Date();
    expiryThreshold.setMinutes(expiryThreshold.getMinutes() - 30);

    // Only expire PENDING_MANAGER_APPROVAL — the only active state
    const pendingRequests = await this.timeOffRepository.find({
      where: { status: TimeOffStatus.PENDING_MANAGER_APPROVAL },
    });

    for (const request of pendingRequests) {
      if (request.createdAt < expiryThreshold) {
        try {
          const days = calculateDays(request.startDate, request.endDate);

          request.status = TimeOffStatus.EXPIRED;
          await this.timeOffRepository.save(request);
          await this.balanceService.rejectPending(request.employeeId, request.locationId, days);

          this.logger.log(`Expired request ${request.id}: released ${days} pendingDays`);
          this.auditService.log(AuditAction.REQUEST_EXPIRED, request.employeeId, request.id, {
            reason: 'TTL exceeded for PENDING_MANAGER_APPROVAL',
            days,
          });
        } catch (error) {
          this.logger.error(`Failed to expire request ${request.id}: ${error.message}`);
        }
      }
    }
  }
}
