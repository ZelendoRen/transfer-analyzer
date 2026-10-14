import {
  IsDateString,
  IsEnum,
  IsEthereumAddress,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

import { toInt, toIsoDate, toUpperCase } from '../../common/transforms';
import { ApiProperty } from '@nestjs/swagger';

import { OrderDirectionEnum } from '../../enum/database.enum';

export class GetLogsRequestDTO {
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

  @ApiProperty({
    description: 'Address of the sender, that will be used as a filter',
    type: 'string',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsEthereumAddress()
  from: string;

  @ApiProperty({
    description: 'Address of the receiver, that will be used as a filter',
    type: 'string',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsEthereumAddress()
  to: string;

  @ApiProperty({
    description: 'Limit of the logs that will be returned',
    type: 'number',
    required: false,
    maximum: 10000,
    minimum: 0,
  })
  @IsOptional()
  @Transform(toInt('23'))
  @IsNumber()
  @Max(10000, { message: 'Max value is 10000' })
  @Min(0, { message: 'Min value is 0' })
  limit: number = 23;

  @ApiProperty({
    description: 'Offset of the logs that will be returned',
    type: 'number',
    required: false,
    minimum: 0,
  })
  @IsOptional()
  @Transform(toInt('0'))
  @IsNumber()
  @Min(0, { message: 'Min value is 0' })
  offset: number = 0;

  @ApiProperty({
    description: 'Order of the logs that will be returned',
    type: 'string',
    enum: OrderDirectionEnum,
    required: false,
    default: OrderDirectionEnum.DESC,
  })
  @IsOptional()
  @Transform(toUpperCase)
  @IsEnum(OrderDirectionEnum)
  order: OrderDirectionEnum = OrderDirectionEnum.DESC;
}

export class GetLogsQueryResponseDTO {
  @ApiProperty({
    description: 'Transaction hash',
    type: 'string',
  })
  @IsString()
  transactionHash: string;

  @ApiProperty({
    description: 'Block number',
    type: 'number',
  })
  @IsNumber()
  blockNumber: number;

  @ApiProperty({
    description: 'Log index',
    type: 'number',
  })
  @IsNumber()
  logIndex: number;

  @ApiProperty({
    description: 'From address',
    type: 'string',
  })
  @IsString()
  from: string;

  @ApiProperty({
    description: 'To address',
    type: 'string',
  })
  @IsString()
  to: string;

  @ApiProperty({
    description: 'Value of the transaction',
    type: 'string',
  })
  @IsString()
  value: string;

  @ApiProperty({
    description: 'Date when the transaction was executed',
    type: 'string',
  })
  @IsDateString()
  executedDate: string;

  @ApiProperty({
    description: 'Date when the log was uploaded',
    type: 'string',
  })
  @IsDateString()
  uploaded: string;
}
