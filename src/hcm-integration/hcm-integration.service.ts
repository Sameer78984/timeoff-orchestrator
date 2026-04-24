import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

@Injectable()
export class HcmIntegrationService {
  private readonly logger = new Logger(HcmIntegrationService.name);
  
  // configurable failure rate
  private errorRate = 0.2; // 20% failure

  /**
   * Simulates calling the HCM external source of truth to validate a time off request.
   */
  async validateTimeOff(employeeId: string, locationId: string, daysRequested: number): Promise<boolean> {
    await this.simulateLatency();
    this.simulateFailure();
    
    // Mock logic: allow if requested < 20 days. In real world, this queries HCM database.
    this.logger.log(`Validating time off with HCM for employee ${employeeId}`);
    return daysRequested <= 20; 
  }

  /**
   * Simulates batch fetching balances from HCM.
   */
  async fetchBatchBalances(locationId: string): Promise<Array<{ employeeId: string, totalDays: number }>> {
    await this.simulateLatency();
    this.simulateFailure();
    
    // Return dummy data for any employeeId format (in reality, we'd query HCM database)
    // Here we just simulate returning some fixed list or empty array if we don't have known employees.
    return [];
  }

  setErrorRate(rate: number) {
    this.errorRate = rate;
  }

  private async simulateLatency() {
    const delay = Math.floor(Math.random() * 500) + 100; // 100-600ms latency
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  private simulateFailure() {
    if (Math.random() < this.errorRate) {
      this.logger.error('HCM integration failed - simulated 500 External Error');
      throw new InternalServerErrorException('HCM Service Temporarily Unavailable');
    }
  }
}

