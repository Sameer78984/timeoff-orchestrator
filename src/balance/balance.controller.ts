import { Controller, Get, Param } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('balance')
@Controller('balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get(':employeeId/:locationId')
  @ApiOperation({ summary: 'Get local cached balance for an employee' })
  getBalance(@Param('employeeId') employeeId: string, @Param('locationId') locationId: string) {
    return this.balanceService.getBalance(employeeId, locationId);
  }
}

