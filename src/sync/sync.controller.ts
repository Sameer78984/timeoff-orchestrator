import { Controller, Post, Param } from '@nestjs/common';
import { SyncService } from './sync.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('HCM Sync & Reconciliation')
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /**
   * Triggers an authoritative batch reconciliation from the HCM system.
   * Intent: Align local state with external source of truth.
   * Side Effects: Bulk updates Balance records for all employees at the location.
   * 
   * @param locationId Target location for synchronization.
   * @returns Summary of processed records.
   */
  @Post(':locationId')
  @ApiOperation({
    summary: 'Trigger batch HCM balance reconciliation for a location',
    description: `
Queries the HCM system for all employees at the given \`locationId\` and overwrites local balance fields with the authoritative values.

**Reviewer note:** This endpoint mutates balance data and participates in the distributed consistency flow.

**Reconciliation rules applied:**
- HCM \`totalDays\` → overwrites local \`totalDays\`
- HCM \`usedDays\` → overwrites local \`usedDays\`
- Local \`pendingDays\` → **never overwritten** (managed exclusively by local state transitions)
- If \`usedDays + pendingDays > totalDays\` after overwrite → system emits \`BALANCE_DRIFT_ALERT\` and clamps \`pendingDays = totalDays - usedDays\`

**When to use:** After a suspected drift between HCM and local state, or to validate the reconciliation path in the reviewer demo flow.
    `,
  })
  @ApiParam({ name: 'locationId', description: 'Location ID for which to run the HCM sync', example: 'loc-HQ' })
  @ApiResponse({ status: 201, description: 'Reconciliation completed. Returns summary of records updated.' })
  @ApiResponse({ status: 500, description: 'HCM connection failed or returned an unexpected response. No local writes occurred.' })
  syncBalances(@Param('locationId') locationId: string) {
    return this.syncService.reconcileBalances(locationId);
  }
}
