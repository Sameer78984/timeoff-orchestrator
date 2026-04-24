import { Controller, Post, Param } from '@nestjs/common';
import { SyncService } from './sync.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post(':locationId')
  @ApiOperation({ summary: 'Trigger a batch sync of balances from HCM for a location' })
  syncBalances(@Param('locationId') locationId: string) {
    return this.syncService.reconcileBalances(locationId);
  }
}

