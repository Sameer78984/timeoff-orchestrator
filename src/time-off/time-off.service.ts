import { Injectable, BadRequestException, Logger, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TimeOffRequest, TimeOffStatus } from './entities/time-off-request.entity';
import { CreateTimeOffDto } from './dto/create-time-off.dto';
import { BalanceService } from '../balance/balance.service';
import { HcmIntegrationService } from '../hcm-integration/hcm-integration.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { calculateDays } from '../common/utils/calculate-days';
import { Balance } from '../balance/entities/balance.entity';

@Injectable()
export class TimeOffService {
  private readonly logger = new Logger(TimeOffService.name);

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly timeOffRepository: Repository<TimeOffRequest>,
    private readonly balanceService: BalanceService,
    private readonly hcmIntegrationService: HcmIntegrationService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Submits a new time-off request and reserves pending days.
   * 
   * **Business Rules:**
   * - Validates for overlapping active requests.
   * - Validates sufficient balance (total - used - pending).
   * - Automatically provisions a default balance if none exists.
   * 
   * **Side Effects:**
   * - Database: Creates a TimeOffRequest in PENDING_MANAGER_APPROVAL state.
   * - Database: Increments `pendingDays` in the employee's Balance record.
   * - Audit: Logs a REQUEST_CREATED event.
   * 
   * **Transaction Safety:**
   * - Execution is wrapped in a single database transaction (ACID).
   * 
   * @param createDto Request payload containing employeeId, locationId, and dates.
   * @returns The newly created TimeOffRequest entity.
   * @throws BadRequestException on overlap or insufficient balance.
   */
  async requestTimeOff(createDto: CreateTimeOffDto): Promise<TimeOffRequest> {
    const { employeeId, locationId, startDate, endDate } = createDto;

    const requestedDays = calculateDays(startDate, endDate);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let newRequest: TimeOffRequest;
    try {
      // 1. Validate overlapping requests
      const overlaps = await queryRunner.manager
        .createQueryBuilder(TimeOffRequest, 'request')
        .where('request.employeeId = :employeeId', { employeeId })
        .andWhere('request.status NOT IN (:...terminalStatuses)', {
          terminalStatuses: [TimeOffStatus.REJECTED, TimeOffStatus.EXPIRED],
        })
        .andWhere('request.startDate <= :endDate AND request.endDate >= :startDate', { startDate, endDate })
        .getMany();

      if (overlaps.length > 0) {
        throw new BadRequestException('OVERLAP: Time off request overlaps with an existing active request');
      }

      // 2. Validate balance sufficiency
      let balance = await queryRunner.manager.findOne(Balance, {
        where: { employeeId, locationId },
      });

      if (!balance) {
        // Auto-provision with default balance (for mock purposes)
        balance = queryRunner.manager.create(Balance, {
          employeeId,
          locationId,
          totalDays: 20,
          usedDays: 0,
          pendingDays: 0,
          lastSyncedAt: new Date(),
        });
        balance = await queryRunner.manager.save(balance);
      }

      const available = balance.totalDays - balance.usedDays - balance.pendingDays;
      if (available < requestedDays) {
        throw new BadRequestException(`INSUFFICIENT_BALANCE: Available ${available} days, requested ${requestedDays}`);
      }

      // 3. Reserve pendingDays
      // Reserves the days by incrementing pendingDays count locally
      balance.pendingDays += requestedDays;
      await queryRunner.manager.save(balance);

      // 4. Create request
      newRequest = queryRunner.manager.create(TimeOffRequest, {
        employeeId,
        locationId,
        startDate,
        endDate,
        status: TimeOffStatus.PENDING_MANAGER_APPROVAL,
      });
      newRequest = await queryRunner.manager.save(newRequest);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    this.logger.log(`Request ${newRequest.id} created: PENDING_MANAGER_APPROVAL, ${requestedDays} days reserved`);
    this.auditService.log(AuditAction.REQUEST_CREATED, employeeId, newRequest.id, {
      requestedDays,
      locationId,
      status: 'PENDING_MANAGER_APPROVAL',
    });

    return newRequest;
  }

  /**
   * Retrieves all time-off requests currently awaiting manager approval.
   * 
   * @returns Array of TimeOffRequest entities with status PENDING_MANAGER_APPROVAL.
   */
  async getPendingApprovals(): Promise<TimeOffRequest[]> {
    return this.timeOffRepository.find({
      where: { status: TimeOffStatus.PENDING_MANAGER_APPROVAL },
    });
  }

  /**
   * Processes a manager approval for a time-off request.
   * 
   * **Workflow:**
   * 1. Validates request existence and PENDING state.
   * 2. Calls external HCM service to validate eligibility synchronously.
   * 3. On HCM Success: Status → APPROVED, moves `pendingDays` to `usedDays`.
   * 4. On HCM Rejection: Status → REJECTED, rolls back `pendingDays`.
   * 
   * **Side Effects:**
   * - External: Calls HCM Integration Service.
   * - Database: Updates TimeOffRequest and Balance records.
   * - Audit: Logs APPROVED or REJECTED event.
   * 
   * **Transaction Safety:**
   * - Step 2 (Outcome application) is wrapped in a transaction with re-reading of state
   *   to prevent race conditions between HCM call and DB write.
   * 
   * @param id The UUID of the TimeOffRequest.
   * @returns Updated TimeOffRequest entity.
   * @throws NotFoundException if request or balance not found.
   * @throws HttpException (502) if HCM call fails.
   * @throws BadRequestException if request is in invalid state.
   */
  async approveByManager(id: string): Promise<TimeOffRequest> {
    // Step 1: Validate (no TX, no DB write)
    const request = await this.timeOffRepository.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== TimeOffStatus.PENDING_MANAGER_APPROVAL) {
      throw new BadRequestException('INVALID_STATE_TRANSITION: Request is not pending manager approval');
    }

    const requestedDays = calculateDays(request.startDate, request.endDate);

    // External HCM call (no transaction open)
    let hcmResult: boolean;
    try {
      hcmResult = await this.hcmIntegrationService.validateTimeOff(
        request.employeeId,
        request.locationId,
        requestedDays,
      );
    } catch (error) {
      this.logger.error(`HCM call failed for request ${id}: ${error.message}`);
      throw new HttpException('HCM_UNAVAILABLE: HCM validation failed', HttpStatus.BAD_GATEWAY);
    }

    // Step 2: Apply outcome in ONE Bounded Transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Re-read inside TX to guard against concurrent state changes
      const freshRequest = await queryRunner.manager.findOne(TimeOffRequest, { where: { id } });
      if (!freshRequest || freshRequest.status !== TimeOffStatus.PENDING_MANAGER_APPROVAL) {
        throw new BadRequestException('INVALID_STATE_TRANSITION: Request state changed during HCM call');
      }

      const balance = await queryRunner.manager.findOne(Balance, {
        where: { employeeId: freshRequest.employeeId, locationId: freshRequest.locationId },
      });
      if (!balance) throw new NotFoundException('Balance not found');

      if (hcmResult) {
        freshRequest.status = TimeOffStatus.APPROVED;
        // Atomically transfer days from pending to used
        balance.pendingDays = Math.max(0, balance.pendingDays - requestedDays);
        balance.usedDays += requestedDays;
        this.logger.log(`Request ${id}: APPROVED. pendingDays released and moved to usedDays.`);
      } else {
        freshRequest.status = TimeOffStatus.REJECTED;
        // Rollback pending reservation
        balance.pendingDays = Math.max(0, balance.pendingDays - requestedDays);
        this.logger.log(`Request ${id}: REJECTED by HCM. pendingDays released.`);
      }

      await queryRunner.manager.save(freshRequest);
      await queryRunner.manager.save(balance);
      await queryRunner.commitTransaction();

      this.auditService.log(
        hcmResult ? AuditAction.APPROVED : AuditAction.REJECTED,
        freshRequest.employeeId,
        freshRequest.id,
        { reason: hcmResult ? 'HCM approved' : 'HCM rejected', requestedDays },
      );

      return freshRequest;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Processes a manager rejection for a time-off request.
   * 
   * **Business Rules:**
   * - Immediately releases `pendingDays` reservation.
   * - No HCM call is required for manual rejection.
   * 
   * **Side Effects:**
   * - Database: Status → REJECTED, decrements `pendingDays`.
   * - Audit: Logs REJECTED event.
   * 
   * **Transaction Safety:**
   * - Execution is wrapped in a single database transaction.
   * 
   * @param id The UUID of the TimeOffRequest.
   * @returns Updated TimeOffRequest entity.
   * @throws NotFoundException if request or balance not found.
   */
  async rejectByManager(id: string): Promise<TimeOffRequest> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const request = await queryRunner.manager.findOne(TimeOffRequest, { where: { id } });
      if (!request) throw new NotFoundException('Request not found');
      if (request.status !== TimeOffStatus.PENDING_MANAGER_APPROVAL) {
        throw new BadRequestException('INVALID_STATE_TRANSITION: Request is not pending manager approval');
      }

      const requestedDays = calculateDays(request.startDate, request.endDate);

      request.status = TimeOffStatus.REJECTED;
      const balance = await queryRunner.manager.findOne(Balance, {
        where: { employeeId: request.employeeId, locationId: request.locationId },
      });
      if (!balance) throw new NotFoundException('Balance not found');
      // Release the pending reservation without incrementing usedDays
      balance.pendingDays = Math.max(0, balance.pendingDays - requestedDays);

      await queryRunner.manager.save(request);
      await queryRunner.manager.save(balance);
      await queryRunner.commitTransaction();

      this.logger.log(`Request ${id}: REJECTED by manager. pendingDays released.`);
      this.auditService.log(AuditAction.REJECTED, request.employeeId, request.id, {
        reason: 'Manager rejected',
        requestedDays,
      });

      return request;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
