import { Controller, Get, Param } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Balance Service')
@Controller('balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get(':employeeId/:locationId')
  @ApiOperation({
    summary: 'Get local cached balance for a given employee and location',
    description: `
Returns the three-component balance snapshot stored locally.

| Field | Description |
|-------|-------------|
| \`totalDays\` | Authoritative entitlement from HCM (overwritten on each sync). |
| \`usedDays\` | Days for fully APPROVED requests. Incremented after manager + HCM approval. |
| \`pendingDays\` | Days soft-reserved for inflight requests (PENDING_MANAGER_APPROVAL / PENDING_HCM_VALIDATION). Released on rejection or expiry. |

**Effective available days** = \`totalDays - usedDays - pendingDays\`

> **Note:** This reflects local state only. It may lag the HCM source of truth by up to one sync cycle.
    `,
  })
  @ApiParam({ name: 'employeeId', description: 'Employee ID returned from POST /employee', example: 'emp-001' })
  @ApiParam({ name: 'locationId', description: 'Location identifier tied to the balance record', example: 'loc-HQ' })
  @ApiResponse({
    status: 200,
    description: 'Local balance record.',
    schema: {
      example: {
        totalDays: 20,
        usedDays: 5,
        pendingDays: 3,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'No balance record found for the given employeeId + locationId combination.' })
  getBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.balanceService.getBalance(employeeId, locationId);
  }
}
