import {
  IsEthereumAddress,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TopicNames } from '../../enum/blockchain.enum';

import { Transform } from 'class-transformer';

import { toInt } from '../../common/transforms';

export class GetLogsRequestDTO {
  @ApiProperty({
    description: 'Block number from which the logs are starting',
    type: 'number',
    required: true,
  })
  @IsNotEmpty()
  @Transform(toInt())
  @IsNumber()
  startBlock: number;

  @ApiProperty({
    description: 'Block number from which the logs are ending',
    type: 'number',
    required: true,
  })
  @IsNotEmpty()
  @Transform(toInt())
  @IsNumber()
  endBlock: number;

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
    description: 'Topic name of the logs',
    type: 'string',
    required: false,
  })
  @IsOptional()
  @IsString()
  topicName: TopicNames = TopicNames.Transfer;
}

export class GetLogsQueryResponseDTO {
  @ApiProperty({
    description: 'Transaction hash',
    type: 'string',
  })
  @IsString()
  transactionHash: string;

  @ApiProperty({
    description: 'Uploaded timestamp',
    type: 'string',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  uploaded: string | undefined;

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
  @IsEthereumAddress()
  from: string;
  @ApiProperty({
    description: 'To address',
    type: 'string',
  })
  @IsString()
  @IsEthereumAddress()
  to: string;

  @ApiProperty({
    description: 'Value of the transaction',
    type: 'string',
  })
  @IsString()
  value: string;
}
