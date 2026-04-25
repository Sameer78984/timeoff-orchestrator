import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

@Injectable()
export class HcmIntegrationService {
  private readonly logger = new Logger(HcmIntegrationService.name);

  // Configurable failure rate for testing
  private errorRate = 0.2; // 20% failure

  /**
   * Simulates calling the HCM external source of truth to validate a time off request.
   * Returns: true (approved) | false (rejected) | throws (infrastructure failure).
   */
  async validateTimeOff(employeeId: string, locationId: string, daysRequested: number): Promise<boolean> {
    await this.simulateLatency();
    this.simulateFailure();

    this.logger.log(`HCM validateTimeOff: employee=${employeeId}, location=${locationId}, days=${daysRequested}`);
    // Mock rule: approve if requested <= 20 days
    return daysRequested <= 20;
  }

  /**
   * Simulates batch fetching balances from HCM.
   * Returns realistic mock data with both totalDays and usedDays.
   */
  async fetchBatchBalances(locationId: string): Promise<Array<{ employeeId: string; totalDays: number; usedDays: number }>> {
    await this.simulateLatency();
    this.simulateFailure();

    this.logger.log(`HCM fetchBatchBalances: location=${locationId}`);

    // Return realistic mock data for demo/test purposes
    return [
      { employeeId: 'emp-001', totalDays: 20, usedDays: 3 },
      { employeeId: 'emp-002', totalDays: 15, usedDays: 5 },
    ];
  }

  setErrorRate(rate: number) {
    this.errorRate = rate;
  }

  private async simulateLatency() {
    const delay = Math.floor(Math.random() * 300) + 100; // 100-400ms
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  private simulateFailure() {
    if (Math.random() < this.errorRate) {
      this.logger.error('HCM integration failed - simulated infrastructure failure');
      throw new InternalServerErrorException('HCM Service Temporarily Unavailable');
    }
  }
}
