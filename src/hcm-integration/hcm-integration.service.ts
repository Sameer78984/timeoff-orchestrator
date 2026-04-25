import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

@Injectable()
export class HcmIntegrationService {
  private readonly logger = new Logger(HcmIntegrationService.name);

  // Configurable failure rate for testing
  private errorRate = 0.2; // 20% failure

  /**
   * Simulates a synchronous external call to the HCM (Human Capital Management) 
   * source of truth to validate a time-off request's eligibility.
   * 
   * **Side Effects:**
   * - External: Simulates a high-latency API call.
   * - Reliability: Includes a simulated failure rate to test system resilience.
   * 
   * @param employeeId Employee ID.
   * @param locationId Location ID.
   * @param daysRequested Number of days being requested.
   * @returns `true` if HCM approves, `false` if rejected.
   * @throws InternalServerErrorException on simulated infrastructure failure.
   */
  async validateTimeOff(employeeId: string, locationId: string, daysRequested: number): Promise<boolean> {
    await this.simulateLatency();
    this.simulateFailure();

    this.logger.log(`HCM validateTimeOff: employee=${employeeId}, location=${locationId}, days=${daysRequested}`);
    // Mock business rule: Approves if the request is for 20 days or less.
    return daysRequested <= 20;
  }

  /**
   * Simulates a batch fetch of authoritative balance records for a given location.
   * 
   * **Side Effects:**
   * - External: Simulates high-latency batch retrieval.
   * 
   * @param locationId The location for which to fetch records.
   * @returns Array of authoritative balance records containing total and used days.
   * @throws InternalServerErrorException on simulated infrastructure failure.
   */
  async fetchBatchBalances(locationId: string): Promise<Array<{ employeeId: string; totalDays: number; usedDays: number }>> {
    await this.simulateLatency();
    this.simulateFailure();

    this.logger.log(`HCM fetchBatchBalances: location=${locationId}`);

    // Realistic static mock data used for system demonstrations and testing.
    return [
      { employeeId: 'emp-001', totalDays: 20, usedDays: 3 },
      { employeeId: 'emp-002', totalDays: 15, usedDays: 5 },
    ];
  }

  /**
   * Configures the simulated error rate for infrastructure stability testing.
   * 
   * @param rate Decimal value between 0.0 and 1.0 (e.g., 0.2 = 20% failure).
   */
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
