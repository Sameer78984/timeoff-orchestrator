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
   * POST /sync/:locationId
   * Per-employee transactional sync. Pure overwrite of totalDays + usedDays.
   * pendingDays clamped only if invariant violated.
   */
  async reconcileBalances(locationId: string) {
    this.logger.log(`Starting balance reconciliation for location: ${locationId}`);

    const hcmBalances = await this.hcmIntegrationService.fetchBatchBalances(locationId);

    const syncResults = { updated: 0, failed: 0 };

    for (const hcmBalance of hcmBalances) {
      try {
        await this.balanceService.upsertFromHcm(
          hcmBalance.employeeId,
          locationId,
          hcmBalance.totalDays,
          hcmBalance.usedDays,
        );
        syncResults.updated++;
        this.logger.log(`Synced employee=${hcmBalance.employeeId}: totalDays=${hcmBalance.totalDays}, usedDays=${hcmBalance.usedDays}`);
      } catch (err) {
        this.logger.error(`Failed to reconcile employee=${hcmBalance.employeeId}: ${err.message}`);
        syncResults.failed++;
      }
    }

    this.logger.log(`Reconciliation complete for location=${locationId}: updated=${syncResults.updated}, failed=${syncResults.failed}`);
    return syncResults;
  }
}
