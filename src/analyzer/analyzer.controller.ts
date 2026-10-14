import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  Logger,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { GetLogsQueryResponseDTO, GetLogsRequestDTO } from './dto/getLogs.dto';
import { FormattedLogType } from '../types/types';
import { AnalyzerService } from './analyzer.service';
import { Errors } from '../enum/errors.enum';

@ApiTags('Analyzer')
@Controller('analyzer')
export class AnalyzerController {
  private readonly logger = new Logger(AnalyzerController.name);
  constructor(private readonly analyzerService: AnalyzerService) {}

  validateRangeParams(
    startBlock: string | number | undefined,
    endBlock: string | number | undefined,
  ): { startBlockNum: number; endBlockNum: number } {
    const hasBlockRange = startBlock !== undefined && endBlock !== undefined;

    if (!hasBlockRange) {
      throw new BadRequestException(
        'Both startBlock and endBlock are required.',
      );
    }

    let startBlockNum: number = 0;
    let endBlockNum: number = 0;

    if (hasBlockRange) {
      startBlockNum = Number(startBlock);
      endBlockNum = Number(endBlock);
      if (endBlockNum < startBlockNum) {
        throw new BadRequestException(
          'endBlock must be greater than or equal to startBlock.',
        );
      }
    }
    return { startBlockNum, endBlockNum };
  }

  @Get('logs')
  @ApiOperation({
    summary: 'Get logs',
    description:
      'Directly from the blockchain, bypassing the database. The block range is limited by the RPC node',
  })
  @ApiResponse({
    status: 200,
    description: 'Logs successfully fetched',
    isArray: true,
    example: [
      {
        transactionHash:
          '0x2b326a283dbbfe4cff4ed4609b76cec49308983cc572ff730ed55df875fc7c29',
        blockNumber: 7390439,
        logIndex: 1,
        from: '0x0000000000000000000000000000000000000000',
        to: '0x4C90c8a368F7d1F4a57906139bAc23C72f38F4cf',
        value: '200000',
      },
      {
        transactionHash:
          '0x4139234f1f9618d6ef07cbc5812a058004a0814873a01a81889771c592009390',
        blockNumber: 7390447,
        logIndex: 1,
        from: '0x0000000000000000000000000000000000000000',
        to: '0xB5dc6671e7cdAaA2386536295BF63A221b67311a',
        value: '200000',
      },
      {
        transactionHash:
          '0xd98180a35a0b5b493cdec899adfae243722f14dba561504614189757e97a9009',
        blockNumber: 7390466,
        logIndex: 7,
        from: '0x4C90c8a368F7d1F4a57906139bAc23C72f38F4cf',
        to: '0xcb9968Cb0d6612e1167e445774997C63a0792dbF',
        value: '100000',
      },
    ],
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getLogs(
    @Query() query: GetLogsRequestDTO,
  ): Promise<GetLogsQueryResponseDTO[]> {
    try {
      const { startBlock, endBlock, topicName, from, to } = query;
      const { startBlockNum, endBlockNum } = this.validateRangeParams(
        startBlock,
        endBlock,
      );
      const logs: FormattedLogType[] = await this.analyzerService.getLogs({
        startBlock: startBlockNum.toString(),
        endBlock: endBlockNum?.toString(),
        topicName: topicName,
        filter: {
          from,
          to,
        },
      });
      return logs.map((log) => {
        const responseLog = new GetLogsQueryResponseDTO();
        responseLog.transactionHash = log.transactionHash;
        responseLog.blockNumber = log.blockNumber;
        responseLog.logIndex = log.logIndex;
        responseLog.from = log.from;
        responseLog.to = log.to;
        responseLog.value = log.value;
        return responseLog;
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(error);
      throw new InternalServerErrorException(Errors.GetLogs);
    }
  }
}
