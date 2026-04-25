import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from './entities/balance.entity';

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  constructor(
    @InjectRepository(Balance)
    private readonly balanceRepository: Repository<Balance>,
  ) {}

  async getBalance(employeeId: string, locationId: string): Promise<Balance> {
    let balance = await this.balanceRepository.findOne({ where: { employeeId, locationId } });
    if (!balance) {
      balance = this.balanceRepository.create({
        employeeId,
        locationId,
        totalDays: 20, // Default for mock purposes
        usedDays: 0,
        pendingDays: 0,
        lastSyncedAt: new Date(),
      });
      await this.balanceRepository.save(balance);
    }
    return balance;
  }

  /**
   * Reserve pending days. Only called inside a QueryRunner transaction in TimeOffService.
   * This standalone method is retained for direct-injection test scenarios.
   */
  async updatePending(employeeId: string, locationId: string, days: number): Promise<Balance> {
    const balance = await this.getBalance(employeeId, locationId);
    balance.pendingDays += days;
    return this.balanceRepository.save(balance);
  }

  /**
   * Release pending days on approval.
   * usedDays is NOT incremented — it is owned exclusively by HCM sync.
   */
  async approvePending(employeeId: string, locationId: string, days: number): Promise<Balance> {
    const balance = await this.getBalance(employeeId, locationId);
    balance.pendingDays = Math.max(0, balance.pendingDays - days);
    return this.balanceRepository.save(balance);
  }

  /**
   * Release pending days on rejection.
   * Floor at 0 to prevent negative pendingDays under any condition.
   */
  async rejectPending(employeeId: string, locationId: string, days: number): Promise<Balance> {
    const balance = await this.getBalance(employeeId, locationId);
    balance.pendingDays = Math.max(0, balance.pendingDays - days);
    return this.balanceRepository.save(balance);
  }

  /**
   * Overwrite balance from HCM sync. Pure overwrite semantics.
   * totalDays and usedDays are owned exclusively by HCM.
   * pendingDays is owned locally — only clamped if invariant violated.
   */
  async upsertFromHcm(
    employeeId: string,
    locationId: string,
    totalDays: number,
    usedDays: number,
  ): Promise<Balance> {
    return this.balanceRepository.manager.transaction(async (manager) => {
      let balance = await manager.findOne(Balance, { where: { employeeId, locationId } });

      if (balance) {
        balance.totalDays = totalDays;
        balance.usedDays = usedDays;
        balance.lastSyncedAt = new Date();

        // Clamp pendingDays if invariant violated after HCM overwrite
        if (balance.usedDays + balance.pendingDays > balance.totalDays) {
          const clamped = Math.max(0, balance.totalDays - balance.usedDays);
          this.logger.warn(
            `BALANCE_DRIFT_ALERT: employee=${employeeId} location=${locationId} ` +
            `pendingDays clamped from ${balance.pendingDays} to ${clamped} ` +
            `(totalDays=${totalDays}, usedDays=${usedDays})`,
          );
          balance.pendingDays = clamped;
        }
      } else {
        balance = manager.create(Balance, {
          employeeId,
          locationId,
          totalDays,
          usedDays,
          pendingDays: 0,
          lastSyncedAt: new Date(),
        });
      }

      return manager.save(balance);
    });
  }
}
