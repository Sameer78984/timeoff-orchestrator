import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Balance Service')
@Controller('balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  /**
   * Retrieves the current balance for an employee at a specific location.
   * 
   * **Note:** If no record exists, the service will auto-provision one with 
   * default values (20 total, 0 used, 0 pending).
   * 
   * @param employeeId Unique employee identifier.
   * @param locationId Location identifier.
   * @returns Current local balance snapshot.
   * @throws NotFoundException if the balance could not be retrieved or provisioned.
   */
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
  async getBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
  ) {
    const balance = await this.balanceService.getBalance(employeeId, locationId);
    if (!balance) {
      throw new NotFoundException(`Balance not found for employee ${employeeId} at location ${locationId}`);
    }
    return balance;
  }
}
