import { Controller, Post, Body, Headers, BadRequestException, Patch, Param, Get } from '@nestjs/common';
import { TimeOffService } from './time-off.service';
import { CreateTimeOffDto } from './dto/create-time-off.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { IdempotencyService } from '../idempotency/idempotency.service';

@ApiTags('time-off')
@Controller('time-off')
export class TimeOffController {
  constructor(
    private readonly timeOffService: TimeOffService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post('request')
  @ApiOperation({ summary: 'Submit a new time-off request' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'Unique key to prevent double processing', required: true })
  @ApiResponse({ status: 201, description: 'Request created and evaluated' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or overlapping request' })
  @ApiResponse({ status: 502, description: 'HCM Integration Failed' })
  async requestTimeOff(@Body() createDto: CreateTimeOffDto, @Headers('Idempotency-Key') idempotencyKey: string) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const existingResponse = await this.idempotencyService.checkOrRecord(idempotencyKey, createDto);
    if (existingResponse) {
      return existingResponse; 
    }

    const response = await this.timeOffService.requestTimeOff(createDto);

    await this.idempotencyService.saveResult(idempotencyKey, createDto, response);
    return response;
  }

  @Get('pending-approval')
  @ApiOperation({ summary: 'Get all requests awaiting manager approval' })
  async getPendingApprovals() {
    return this.timeOffService.getPendingApprovals();
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Manager action to approve a request and trigger HCM validation' })
  async approveRequest(@Param('id') id: string) {
    return this.timeOffService.approveByManager(id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Manager action to reject a request' })
  async rejectRequest(@Param('id') id: string) {
    return this.timeOffService.rejectByManager(id);
  }
}



