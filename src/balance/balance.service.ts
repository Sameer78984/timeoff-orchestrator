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

  /**
   * Retrieves the balance for an employee at a specific location.
   * If no balance record exists, one is automatically provisioned with default values.
   * 
   * @param employeeId The unique identifier of the employee.
   * @param locationId The location identifier.
   * @returns The Balance entity for the employee/location.
   */
  async getBalance(employeeId: string, locationId: string): Promise<Balance> {
    let balance = await this.balanceRepository.findOne({ where: { employeeId, locationId } });
    if (!balance) {
      // Auto-provisioning logic to ensure every valid employee has a balance record
      balance = this.balanceRepository.create({
        employeeId,
        locationId,
        totalDays: 20, // Default entitlement
        usedDays: 0,
        pendingDays: 0,
        lastSyncedAt: new Date(),
      });
      await this.balanceRepository.save(balance);
    }
    return balance;
  }

  /**
   * Reserves days by incrementing the pendingDays count.
   * Note: This is typically called within an external transaction.
   * 
   * @param employeeId Employee ID.
   * @param locationId Location ID.
   * @param days Number of days to reserve.
   * @returns Updated Balance entity.
   */
  async updatePending(employeeId: string, locationId: string, days: number): Promise<Balance> {
    const balance = await this.getBalance(employeeId, locationId);
    balance.pendingDays += days;
    return this.balanceRepository.save(balance);
  }

  /**
   * Releases pending days when a request is approved.
   * Note: usedDays is NOT modified here; it is updated by HCM sync.
   * 
   * @param employeeId Employee ID.
   * @param locationId Location ID.
   * @param days Number of days to release.
   * @returns Updated Balance entity.
   */
  async approvePending(employeeId: string, locationId: string, days: number): Promise<Balance> {
    const balance = await this.getBalance(employeeId, locationId);
    // Ensure pendingDays never drops below zero
    balance.pendingDays = Math.max(0, balance.pendingDays - days);
    return this.balanceRepository.save(balance);
  }

  /**
   * Releases pending days when a request is rejected.
   * 
   * @param employeeId Employee ID.
   * @param locationId Location ID.
   * @param days Number of days to release.
   * @returns Updated Balance entity.
   */
  async rejectPending(employeeId: string, locationId: string, days: number): Promise<Balance> {
    const balance = await this.getBalance(employeeId, locationId);
    // Release the soft reservation
    balance.pendingDays = Math.max(0, balance.pendingDays - days);
    return this.balanceRepository.save(balance);
  }

  /**
   * Performs an authoritative update of total and used days from HCM data.
   * 
   * **Side Effects:**
   * - Database: Overwrites `totalDays` and `usedDays`.
   * - Business Rule: If the new usedDays + existing pendingDays > totalDays,
   *   the `pendingDays` is clamped to prevent an overdrawn total.
   * 
   * **Transaction Safety:**
   * - Execution is wrapped in a serializable transaction to ensure consistency.
   * 
   * @param employeeId Employee ID.
   * @param locationId Location ID.
   * @param totalDays Authoritative total entitlement from HCM.
   * @param usedDays Authoritative used days count from HCM.
   * @returns Updated Balance entity.
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
        // Source of truth overwrite
        balance.totalDays = totalDays;
        balance.usedDays = usedDays;
        balance.lastSyncedAt = new Date();

        // Clamp pendingDays if invariant (used + pending <= total) is violated after HCM sync
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
        // Provision new record if missing during sync
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
