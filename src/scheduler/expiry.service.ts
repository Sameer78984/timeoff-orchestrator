import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeOffRequest, TimeOffStatus } from '../time-off/entities/time-off-request.entity';
import { BalanceService } from '../balance/balance.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';

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
    expiryThreshold.setMinutes(expiryThreshold.getMinutes() - 30); // 30 mins TTL

    const pendingRequests = await this.timeOffRepository.find({
      where: {
        status: TimeOffStatus.PENDING_MANAGER_APPROVAL,
      },
    });

    for (const request of pendingRequests) {
      if (request.createdAt < expiryThreshold) {
        try {
          this.logger.log(`Expiring stuck request: ${request.id}`);
          request.status = TimeOffStatus.EXPIRED;
          await this.timeOffRepository.save(request);

          // Calculate days
          const start = new Date(request.startDate);
          const end = new Date(request.endDate);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

          // Release the pending locks
          await this.balanceService.rejectPending(request.employeeId, request.locationId, days);

          this.auditService.log(
            AuditAction.REQUEST_EXPIRED,
            request.employeeId,
            request.id,
            { reason: 'TTL exceeded for PENDING state' }
          );
        } catch (error) {
          this.logger.error(`Failed to expire request ${request.id}`, error);
        }
      }
    }
  }
}
