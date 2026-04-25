import { Injectable, Logger } from '@nestjs/common';
import { HcmIntegrationService } from '../hcm-integration/hcm-integration.service';
import { BalanceService } from '../balance/balance.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly hcmIntegrationService: HcmIntegrationService,
    private readonly balanceService: BalanceService,
  ) {}

  /**
   * Triggers a batch reconciliation process for all employees at a specific location.
   * 
   * **Workflow:**
   * 1. Fetches authoritative balance data from the HCM Integration Service.
   * 2. Iterates through each record and performs an `upsertFromHcm` in the local DB.
   * 
   * **Side Effects:**
   * - External: Calls HCM Integration Service to fetch batch data.
   * - Database: Multiple `upsertFromHcm` calls, each transactional.
   * 
   * **Error Handling:**
   * - Gracefully handles individual employee sync failures; the loop continues
   *   to ensure other records are processed.
   * 
   * @param locationId The location identifier for which to run the sync.
   * @returns An object containing the count of `updated` and `failed` records.
   */
  async reconcileBalances(locationId: string) {
    this.logger.log(`Starting balance reconciliation for location: ${locationId}`);

    const hcmBalances = await this.hcmIntegrationService.fetchBatchBalances(locationId);

    const syncResults = { updated: 0, failed: 0 };

    for (const hcmBalance of hcmBalances) {
      try {
        // Individual transactional sync per employee
        await this.balanceService.upsertFromHcm(
          hcmBalance.employeeId,
          locationId,
          hcmBalance.totalDays,
          hcmBalance.usedDays,
        );
        syncResults.updated++;
        this.logger.log(`Synced employee=${hcmBalance.employeeId}: totalDays=${hcmBalance.totalDays}, usedDays=${hcmBalance.usedDays}`);
      } catch (err) {
        // Log failure but don't break the batch loop
        this.logger.error(`Failed to reconcile employee=${hcmBalance.employeeId}: ${err.message}`);
        syncResults.failed++;
      }
    }

    this.logger.log(`Reconciliation complete for location=${locationId}: updated=${syncResults.updated}, failed=${syncResults.failed}`);
    return syncResults;
  }
}
