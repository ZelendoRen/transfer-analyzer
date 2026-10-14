import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { GetLogsRequestDTO, GetLogsQueryResponseDTO } from './dto/getLogs.dto';
import { TotalRequestDTO, TotalResponseDTO } from './dto/total.dto';
import { AggregatorService } from './aggregator.service';
import { Errors } from '../enum/errors.enum';
import {
  ReturnedLogType,
  TopAccountsResponseType,
  TotalParamsResponseType,
} from '../types/types';
import {
  TopAccountsRequestDTO,
  TopAccountsResponseDTO,
} from './dto/topAccounts.dto';

const toIso = (ms: number | undefined): string | undefined =>
  ms === undefined ? undefined : new Date(ms).toISOString();

@ApiTags('Aggregator')
@Controller('aggregator')
export class AggregatorController {
  constructor(private readonly aggregatorService: AggregatorService) {}

  validateRangeParams(
    startBlock: string | number | undefined,
    endBlock: string | number | undefined,
    startDate: string | undefined,
    endDate: string | undefined,
  ) {
    const hasBlockRange = startBlock !== undefined && endBlock !== undefined;
    const hasDateRange = startDate !== undefined && endDate !== undefined;

    if (hasBlockRange && hasDateRange) {
      throw new BadRequestException(
        'You cannot specify both block range and date range.',
      );
    }

    let startBlockNum: number | undefined = undefined;
    let endBlockNum: number | undefined = undefined;
    let startTime: number | undefined = undefined;
    let endTime: number | undefined = undefined;

    if (hasBlockRange) {
      startBlockNum = Number(startBlock);
      endBlockNum = Number(endBlock);
      if (endBlockNum < startBlockNum) {
        throw new BadRequestException(
          'endBlock must be greater than or equal to startBlock.',
        );
      }
    } else if (hasDateRange) {
      startTime = new Date(startDate).getTime();
      endTime = new Date(endDate).getTime();

      if (endTime < startTime) {
        throw new BadRequestException('endDate must be after startDate.');
      }
    }
    return { startBlockNum, endBlockNum, startTime, endTime };
  }

  @Get('logs')
  @ApiOperation({
    summary: 'Get logs',
    description:
      'Get contract logs from the database. Dates are timestamps in milliseconds',
  })
  @ApiResponse({
    status: 200,
    description: 'Logs were successfully fetched',
    type: GetLogsQueryResponseDTO,
    isArray: true,
    example: [
      {
        transactionHash:
          '0xaefe609781e88d91e5b6e0ee0c4295b385614f3d1edca3e5474fdf6b0f82509f',
        blockNumber: 20391007,
        logIndex: 3,
        executedDate: '2025-02-20T18:19:41.000Z',
        uploaded: '2025-02-20T18:19:59.114Z',
        from: '0x2C88A3B97263D703fD6D2434e14fA3a51f3Ce39c',
        to: '0xf4003F4efBE8691B60249E6afbD307aBE7758adb',
        value: '1921',
      },
    ],
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getLogs(
    @Query() query: GetLogsRequestDTO,
  ): Promise<GetLogsQueryResponseDTO[]> {
    const {
      startBlock,
      endBlock,
      startDate,
      endDate,
      from,
      to,
      limit,
      offset,
      order,
    } = query;
    const { startBlockNum, endBlockNum, startTime, endTime } =
      this.validateRangeParams(startBlock, endBlock, startDate, endDate);

    const response: ReturnedLogType[] = await this.aggregatorService.getLogs({
      startBlock: startBlockNum,
      endBlock: endBlockNum,
      startDate: toIso(startTime),
      endDate: toIso(endTime),
      filter: {
        from: from?.toLowerCase(),
        to: to?.toLowerCase(),
        limit,
        offset,
        order,
      },
    });

    return response.map((log) => {
      const logResponse = new GetLogsQueryResponseDTO();
      logResponse.transactionHash = log.transactionhash;
      logResponse.blockNumber = log.blocknumber;
      logResponse.logIndex = log.logindex;
      logResponse.executedDate = log.executeddate;
      logResponse.uploaded = log.uploaded;
      logResponse.from = log.from;
      logResponse.to = log.to;
      logResponse.value = log.value;
      return logResponse;
    });
  }

  @Get('total')
  @ApiOperation({
    summary: 'Get Total',
    description:
      'Get total transactions and values for all indexed period. Also possible to select specific period by date in timestamp or block number',
  })
  @ApiResponse({
    status: 200,
    description: 'Object with total values for selected or all period',
    type: TotalResponseDTO,
    example: {
      firstTransaction: '2021-09-30T09:15:42.000Z',
      lastTransaction: '2025-02-20T18:19:59.000Z',
      firstBlock: 7390439,
      lastBlock: 21048005,
      totalTransactionsCount: '5476041',
      totalValue: '98206728778933391',
      minTransactionValue: '0',
      maxTransactionValue: '193056413000000',
    },
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getTotal(@Query() query: TotalRequestDTO): Promise<TotalResponseDTO> {
    const { startBlock, endBlock, startDate, endDate } = query;
    const { startBlockNum, endBlockNum, startTime, endTime } =
      this.validateRangeParams(startBlock, endBlock, startDate, endDate);

    const response: TotalParamsResponseType | undefined =
      await this.aggregatorService.getTotal({
        startBlock: startBlockNum,
        endBlock: endBlockNum,
        startDate: toIso(startTime),
        endDate: toIso(endTime),
      });
    if (!response) {
      throw new BadRequestException(Errors.NoData);
    }
    const totalResponse = new TotalResponseDTO();
    totalResponse.firstTransaction = response.firsttransactiondate;
    totalResponse.lastTransaction = response.lasttransactiondate;
    totalResponse.firstBlock = response.firstblocknumber;
    totalResponse.lastBlock = response.lastblocknumber;
    totalResponse.totalTransactionsCount = response.totaltransactions;
    totalResponse.totalValue = response.totalvalue;
    totalResponse.minTransactionValue = response.mintransactionvalue;
    totalResponse.maxTransactionValue = response.maxtransactionvalue;

    return totalResponse;
  }

  @Get('top-accounts')
  @ApiOperation({
    summary: 'Get Top Accounts List',
    description:
      'Get top accounts by total value of transactions. Also possible to select specific period by date in timestamp or block number',
  })
  @ApiQuery({ type: TopAccountsRequestDTO })
  @ApiResponse({
    status: 200,
    description: 'List of top accounts',
    type: TopAccountsResponseDTO,
    isArray: true,
    example: [
      {
        address: '0x625E7708f30cA75bfd92586e17077590C60eb4cD',
        totalValue: '15609044266552454',
        totalTransactions: '60059',
      },
      {
        address: '0xBF14DB80D9275FB721383a77C00Ae180fc40ae98',
        totalValue: '6905980867490000',
        totalTransactions: '13822',
      },
      {
        address: '0x279f8940ca2a44C35ca3eDf7d28945254d0F0aE6',
        totalValue: '5103012195406319',
        totalTransactions: '28575',
      },
    ],
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getTopAccounts(
    @Query() query: TopAccountsRequestDTO,
  ): Promise<TopAccountsResponseDTO[]> {
    const {
      startBlock,
      endBlock,
      startDate,
      endDate,
      limit,
      offset,
      order,
      orderBy,
    } = query;
    const { startBlockNum, endBlockNum, startTime, endTime } =
      this.validateRangeParams(startBlock, endBlock, startDate, endDate);
    const response: TopAccountsResponseType[] | undefined =
      await this.aggregatorService.getTopAccounts({
        startBlock: startBlockNum,
        endBlock: endBlockNum,
        startDate: toIso(startTime),
        endDate: toIso(endTime),
        filter: {
          limit,
          offset,
          order,
          orderBy,
        },
      });
    if (!response || response.length === 0) {
      return [];
    }

    return response?.map((account) => {
      const accountResponse = new TopAccountsResponseDTO();
      accountResponse.address = account.address;
      accountResponse.totalValue = account.totalvalue;
      accountResponse.totalTransactions = account.numberoftransactions;
      return accountResponse;
    });
  }
}
