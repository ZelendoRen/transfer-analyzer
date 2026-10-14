import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

import { toInt, toIsoDate } from '../../common/transforms';
import { ApiProperty } from '@nestjs/swagger';

export class TotalRequestDTO {
  @ApiProperty({
    description: 'Block number from which the logs are starting',
    type: 'number',
    required: false,
  })
  @IsOptional()
  @Transform(toInt())
  @IsNumber()
  startBlock: number | undefined;

  @ApiProperty({
    description: 'Block number from which the logs are ending',
    type: 'number',
    required: false,
  })
  @IsOptional()
  @Transform(toInt())
  @IsNumber()
  endBlock: number | undefined;

  @ApiProperty({
    description: 'Start date of the logs. Used timestamp in milliseconds',
    type: 'string',
    required: false,
  })
  @IsOptional()
  @Transform(toIsoDate)
  @IsDateString()
  startDate: string | undefined;

  @ApiProperty({
    description: 'End date of the logs. Used timestamp in milliseconds',
    type: 'string',
    required: false,
  })
  @IsOptional()
  @Transform(toIsoDate)
  @IsDateString()
  endDate: string | undefined;
}

export class TotalResponseDTO {
  @ApiProperty({
    description: 'Execution date of the first indexed transaction (ISO 8601)',
    type: 'string',
  })
  @IsString()
  firstTransaction: string;

  @ApiProperty({
    description: 'Execution date of the last indexed transaction (ISO 8601)',
    type: 'string',
  })
  @IsString()
  lastTransaction: string;

  @ApiProperty({
    description: 'First block number',
    type: 'number',
  })
  @IsNumber()
  firstBlock: number;

  @ApiProperty({
    description: 'Last block number',
    type: 'number',
  })
  @IsNumber()
  lastBlock: number;

  @ApiProperty({
    description: 'Total number of transactions',
    type: 'string',
  })
  @IsString()
  totalTransactionsCount: string;

  @ApiProperty({
    description: 'Total value of transactions in the token base units',
    type: 'string',
  })
  @IsString()
  totalValue: string;

  @ApiProperty({
    description: 'Minimum transaction value in the token base units',
    type: 'string',
  })
  @IsString()
  minTransactionValue: string;

  @ApiProperty({
    description: 'Maximum transaction value in the token base units',
    type: 'string',
  })
  @IsString()
  maxTransactionValue: string;
}
