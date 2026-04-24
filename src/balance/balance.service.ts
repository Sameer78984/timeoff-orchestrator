import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from './entities/balance.entity';

@Injectable()
export class BalanceService {
  constructor(
    @InjectRepository(Balance)
    private readonly balanceRepository: Repository<Balance>
  ) {}

  async getBalance(employeeId: string, locationId: string): Promise<Balance> {
    let balance = await this.balanceRepository.findOne({ where: { employeeId, locationId } });
    if (!balance) {
      // If not yet available in cache, initialize with typical default or error. 
      // For this system, let's create a 0 balance and update from Sync later.
      balance = this.balanceRepository.create({
        employeeId,
        locationId,
        totalDays: 20, // Default for mock purposes
        usedDays: 0,
        pendingDays: 0,
        lastSyncedAt: new Date()
      });
      await this.balanceRepository.save(balance);
    }
    return balance;
  }

  async updatePending(employeeId: string, locationId: string, days: number): Promise<Balance> {
    const balance = await this.getBalance(employeeId, locationId);
    balance.pendingDays += days;
    return this.balanceRepository.save(balance);
  }
  
  async approvePending(employeeId: string, locationId: string, days: number): Promise<Balance> {
    const balance = await this.getBalance(employeeId, locationId);
    balance.pendingDays -= days;
    balance.usedDays += days;
    return this.balanceRepository.save(balance);
  }
  
  async rejectPending(employeeId: string, locationId: string, days: number): Promise<Balance> {
    const balance = await this.getBalance(employeeId, locationId);
    balance.pendingDays -= days;
    return this.balanceRepository.save(balance);
  }

  async upsertFromHcm(employeeId: string, locationId: string, totalDays: number): Promise<Balance> {
    let balance = await this.balanceRepository.findOne({ where: { employeeId, locationId } });
    if (balance) {
      balance.totalDays = totalDays;
      balance.lastSyncedAt = new Date();
    } else {
      balance = this.balanceRepository.create({
        employeeId, locationId, totalDays, usedDays: 0, pendingDays: 0, lastSyncedAt: new Date()
      });
    }
    return this.balanceRepository.save(balance);
  }
}

