import { Injectable, Logger } from '@nestjs/common';
import { HcmIntegrationService } from '../hcm-integration/hcm-integration.service';
import { BalanceService } from '../balance/balance.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly hcmIntegrationService: HcmIntegrationService,
    private readonly balanceService: BalanceService
  ) {}

  async reconcileBalances(locationId: string) {
    this.logger.log(`Starting balance reconciliation for location: ${locationId}`);
    try {
      const hcmBalances = await this.hcmIntegrationService.fetchBatchBalances(locationId);
      
      const syncResults = {
        updated: 0,
        failed: 0,
      };

      for (const hcmBalance of hcmBalances) {
        try {
          await this.balanceService.upsertFromHcm(hcmBalance.employeeId, locationId, hcmBalance.totalDays);
          syncResults.updated++;
        } catch (err) {
          this.logger.error(`Failed to reconcile balance for employee ${hcmBalance.employeeId}: ${err.message}`);
          syncResults.failed++;
        }
      }

      this.logger.log(`Reconciliation complete. Updated: ${syncResults.updated}, Failed: ${syncResults.failed}`);
      return syncResults;
    } catch (err) {
      this.logger.error(`Batch sync failed for location ${locationId}: ${err.message}`);
      throw err;
    }
  }
}

