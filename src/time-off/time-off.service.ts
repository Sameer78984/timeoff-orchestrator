import { Injectable, BadRequestException, InternalServerErrorException, Logger, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TimeOffRequest, TimeOffStatus } from './entities/time-off-request.entity';
import { CreateTimeOffDto } from './dto/create-time-off.dto';
import { BalanceService } from '../balance/balance.service';
import { HcmIntegrationService } from '../hcm-integration/hcm-integration.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';

@Injectable()
export class TimeOffService {
  private readonly logger = new Logger(TimeOffService.name);

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly timeOffRepository: Repository<TimeOffRequest>,
    private readonly balanceService: BalanceService,
    private readonly hcmIntegrationService: HcmIntegrationService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource
  ) {}

  async requestTimeOff(createDto: CreateTimeOffDto): Promise<TimeOffRequest> {
    const { employeeId, locationId, startDate, endDate } = createDto;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) throw new BadRequestException('End date must be after start date');
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const requestedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let newRequest: TimeOffRequest;
    try {
      const overlaps = await queryRunner.manager.createQueryBuilder(TimeOffRequest, 'request')
        .where('request.employeeId = :employeeId', { employeeId })
        .andWhere('request.status != :rejectedStatus AND request.status != :expiredStatus', { rejectedStatus: TimeOffStatus.REJECTED, expiredStatus: TimeOffStatus.EXPIRED })
        .andWhere('(request.startDate <= :endDate AND request.endDate >= :startDate)', { startDate, endDate })
        .getMany();

      if (overlaps.length > 0) {
        throw new BadRequestException('Time off request overlaps with an existing requested or approved time block');
      }

      const balance = await this.balanceService.getBalance(employeeId, locationId);
      if (balance.totalDays - balance.usedDays - balance.pendingDays < requestedDays) {
        throw new BadRequestException('Insufficient balance locally');
      }

      await this.balanceService.updatePending(employeeId, locationId, requestedDays);

      newRequest = this.timeOffRepository.create({
        employeeId,
        locationId,
        startDate,
        endDate,
        status: TimeOffStatus.PENDING_MANAGER_APPROVAL
      });
      newRequest = await queryRunner.manager.save(newRequest);
      
      this.auditService.log(AuditAction.REQUEST_CREATED, employeeId, newRequest.id, { requestedDays, locationId, state: 'PENDING_MANAGER_APPROVAL' });

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    // Returning request. Manager must explicitly approve it to trigger HCM validation.
    return newRequest;
  }

  async getPendingApprovals(): Promise<TimeOffRequest[]> {
    return this.timeOffRepository.find({
      where: { status: TimeOffStatus.PENDING_MANAGER_APPROVAL }
    });
  }

  async rejectByManager(id: string): Promise<TimeOffRequest> {
    const request = await this.timeOffRepository.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== TimeOffStatus.PENDING_MANAGER_APPROVAL) {
      throw new BadRequestException('Request is not pending manager approval');
    }

    const diffTime = Math.abs(new Date(request.endDate).getTime() - new Date(request.startDate).getTime());
    const requestedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    request.status = TimeOffStatus.REJECTED;
    await this.timeOffRepository.save(request);
    await this.balanceService.rejectPending(request.employeeId, request.locationId, requestedDays);
    this.auditService.log(AuditAction.REJECTED, request.employeeId, request.id, { reason: 'Manager Rejected' });

    return request;
  }

  async approveByManager(id: string): Promise<TimeOffRequest> {
    const request = await this.timeOffRepository.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== TimeOffStatus.PENDING_MANAGER_APPROVAL) {
      throw new BadRequestException('Request is not pending manager approval');
    }

    const diffTime = Math.abs(new Date(request.endDate).getTime() - new Date(request.startDate).getTime());
    const requestedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    request.status = TimeOffStatus.PENDING_HCM_VALIDATION;
    await this.timeOffRepository.save(request);

    try {
      const isValidHcm = await this.hcmIntegrationService.validateTimeOff(request.employeeId, request.locationId, requestedDays);
      if (isValidHcm) {
        request.status = TimeOffStatus.APPROVED;
        await this.timeOffRepository.save(request);
        await this.balanceService.approvePending(request.employeeId, request.locationId, requestedDays);
        this.auditService.log(AuditAction.APPROVED, request.employeeId, request.id, { reason: 'HCM validation passed post-manager approval' });
      } else {
        request.status = TimeOffStatus.REJECTED;
        await this.timeOffRepository.save(request);
        await this.balanceService.rejectPending(request.employeeId, request.locationId, requestedDays);
        this.auditService.log(AuditAction.REJECTED, request.employeeId, request.id, { reason: 'HCM rejected insufficient balance' });
        throw new BadRequestException('HCM rejected the request (Insufficient Balance)');
      }
    } catch (error) {
      this.logger.error(`HCM Validation failed after manager approval for request ${request.id}. Error: ${error.message}`);
      throw new HttpException('HCM validation failed, request is pending manual retry', HttpStatus.BAD_GATEWAY);
    }

    return request;
  }
}



