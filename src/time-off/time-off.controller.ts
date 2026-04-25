import { Controller, Post, Body, Headers, BadRequestException, Patch, Param, Get } from '@nestjs/common';
import { TimeOffService } from './time-off.service';
import { CreateTimeOffDto } from './dto/create-time-off.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader, ApiParam } from '@nestjs/swagger';
import { IdempotencyService } from '../idempotency/idempotency.service';

@ApiTags('Time-Off Workflow')
@Controller('time-off')
export class TimeOffController {
  constructor(
    private readonly timeOffService: TimeOffService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Submits a new time-off request with idempotency protection.
   * Input: CreateTimeOffDto via body, Idempotency-Key via header.
   * Intent: Initiate request flow and reserve pending days locally.
   */
  @Post('request')
  @ApiOperation({
    summary: 'Submit a new time-off request',
    description: `
Reserves \`pendingDays\` locally and creates the request in \`PENDING_MANAGER_APPROVAL\` state.

**Reviewer note:** This endpoint mutates balance (\`pendingDays +requestedDays\`) and initiates the distributed consistency flow.
A manager must explicitly call \`PATCH /time-off/{id}/approve\` or \`PATCH /time-off/{id}/reject\` to progress the state.

**Balance before:** \`pendingDays = N\`
**Balance after:** \`pendingDays = N + requestedDays\`
    `,
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Required UUID string. Prevents duplicate processing on network retries. A repeated key with the same payload returns the cached response instantly with no side effects. A repeated key with a different payload returns 409.',
    required: true,
    example: 'a3f1b2c4-d5e6-7890-abcd-ef1234567890',
  })
  @ApiResponse({ status: 201, description: 'Request created. Status = PENDING_MANAGER_APPROVAL. pendingDays incremented.' })
  @ApiResponse({ status: 400, description: 'Validation failed: Idempotency-Key missing | endDate < startDate | Insufficient balance (usedDays + pendingDays + requestedDays > totalDays) | Overlapping active request exists.' })
  @ApiResponse({ status: 409, description: 'Idempotency-Key reused with a different request payload.' })
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

  /**
   * Retrieves all requests currently awaiting manual manager review.
   */
  @Get('pending-approval')
  @ApiOperation({
    summary: 'List all requests awaiting manager approval',
    description: 'Returns all TimeOffRequest records with status = PENDING_MANAGER_APPROVAL. Use the returned `id` values to call the approve or reject endpoints.',
  })
  @ApiResponse({ status: 200, description: 'Array of TimeOffRequest objects in PENDING_MANAGER_APPROVAL state. Empty array if none exist.' })
  async getPendingApprovals() {
    return this.timeOffService.getPendingApprovals();
  }

  /**
   * Endpoint for managers to approve a request.
   * Triggers synchronous HCM validation and final state transition.
   */
  @Patch(':id/approve')
  @ApiOperation({
    summary: 'Manager approves a request → triggers HCM validation',
    description: `
Validates the request synchronously against HCM. No intermediate state is written before the HCM call completes.

**On HCM success (200):** Status → \`APPROVED\`. \`pendingDays - requestedDays\`, \`usedDays + requestedDays\`. Returns 200.
**On HCM rejection (400):** Status → \`REJECTED\`. \`pendingDays - requestedDays\` (immediate rollback). Returns 200 with status=REJECTED.
**On HCM fault (5xx/timeout):** No DB write. Status stays \`PENDING_MANAGER_APPROVAL\`. Returns \`502\`. Manager may retry.
    `,
  })
  @ApiParam({ name: 'id', description: 'The UUID of the TimeOffRequest returned from POST /time-off/request', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ status: 200, description: 'HCM responded. Status = APPROVED or REJECTED. Balance mutations applied atomically.' })
  @ApiResponse({ status: 400, description: 'Request not in PENDING_MANAGER_APPROVAL state (INVALID_STATE_TRANSITION).' })
  @ApiResponse({ status: 404, description: 'No TimeOffRequest found with the given ID.' })
  @ApiResponse({ status: 502, description: 'HCM is unavailable (5xx or timeout). No state change occurred. Safe to retry.' })
  async approveRequest(@Param('id') id: string) {
    return this.timeOffService.approveByManager(id);
  }

  /**
   * Endpoint for managers to manually reject a request.
   * Performs an immediate local rollback of pending days.
   */
  @Patch(':id/reject')
  @ApiOperation({
    summary: 'Manager rejects a request — no HCM call made',
    description: `
Immediately transitions status from \`PENDING_MANAGER_APPROVAL\` → \`REJECTED\` and rolls back \`pendingDays\`.

**Balance before:** \`pendingDays = N\`
**Balance after:** \`pendingDays = N - requestedDays\`

HCM is not contacted. Rollback is synchronous and immediate.
    `,
  })
  @ApiParam({ name: 'id', description: 'The UUID of the TimeOffRequest to reject', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ status: 200, description: 'Request rejected. Status = REJECTED. pendingDays rolled back.' })
  @ApiResponse({ status: 400, description: 'Request is not in PENDING_MANAGER_APPROVAL state.' })
  @ApiResponse({ status: 404, description: 'No TimeOffRequest found with the given ID.' })
  async rejectRequest(@Param('id') id: string) {
    return this.timeOffService.rejectByManager(id);
  }
}
