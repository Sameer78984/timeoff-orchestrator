import { IsString, IsNotEmpty, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTimeOffDto {
  @ApiProperty({ example: 'uuid-employee-id' })
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @ApiProperty({ example: 'LOCATION_US_EAST' })
  @IsString()
  @IsNotEmpty()
  locationId: string;

  @ApiProperty({ example: '2026-05-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-05-05' })
  @IsDateString()
  endDate: string;
}
