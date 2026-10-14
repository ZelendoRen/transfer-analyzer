import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AggregatorController } from './aggregator.controller';
import { AggregatorService } from './aggregator.service';
import { GetLogsRequestDTO } from './dto/getLogs.dto';
import { TopAccountsRequestDTO } from './dto/topAccounts.dto';
import { TotalRequestDTO } from './dto/total.dto';
import { OrderByEnum, OrderDirectionEnum } from '../enum/database.enum';
import { Errors } from '../enum/errors.enum';

const START = '2021-05-03T00:00:00.000Z';
const END = '2021-05-04T00:00:00.000Z';

describe('AggregatorController', () => {
  let controller: AggregatorController;
  let aggregatorService: jest.Mocked<AggregatorService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AggregatorController],
      providers: [
        {
          provide: AggregatorService,
          useValue: {
            getLogs: jest.fn().mockResolvedValue([]),
            getTotal: jest.fn(),
            getTopAccounts: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    controller = module.get(AggregatorController);
    aggregatorService = module.get(AggregatorService);
  });

  describe('validateRangeParams', () => {
    it('returns nothing when no range is given', () => {
      expect(
        controller.validateRangeParams(
          undefined,
          undefined,
          undefined,
          undefined,
        ),
      ).toEqual({
        startBlockNum: undefined,
        endBlockNum: undefined,
        startTime: undefined,
        endTime: undefined,
      });
    });

    it('parses a block range', () => {
      const result = controller.validateRangeParams(
        '10',
        20,
        undefined,
        undefined,
      );

      expect(result).toMatchObject({ startBlockNum: 10, endBlockNum: 20 });
    });

    it('parses a date range into milliseconds', () => {
      const result = controller.validateRangeParams(
        undefined,
        undefined,
        START,
        END,
      );

      expect(result).toMatchObject({
        startTime: Date.parse(START),
        endTime: Date.parse(END),
      });
    });

    it('rejects a block range and a date range together', () => {
      expect(() => controller.validateRangeParams(1, 2, START, END)).toThrow(
        BadRequestException,
      );
    });

    it('rejects an inverted block range', () => {
      expect(() =>
        controller.validateRangeParams(20, 10, undefined, undefined),
      ).toThrow(BadRequestException);
    });

    it('rejects an inverted date range', () => {
      expect(() =>
        controller.validateRangeParams(undefined, undefined, END, START),
      ).toThrow(BadRequestException);
    });
  });
  describe('getLogs', () => {
    it('passes dates to the database as ISO strings, not as epoch milliseconds', async () => {
      await controller.getLogs({
        startDate: START,
        endDate: END,
        limit: 23,
        offset: 0,
        order: OrderDirectionEnum.DESC,
      } as GetLogsRequestDTO);

      expect(aggregatorService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ startDate: START, endDate: END }),
      );
    });

    it('lower-cases the address filters and forwards pagination', async () => {
      await controller.getLogs({
        from: '0xABCDEF0000000000000000000000000000000001',
        to: '0xABCDEF0000000000000000000000000000000002',
        limit: 5,
        offset: 10,
        order: OrderDirectionEnum.ASC,
      } as GetLogsRequestDTO);

      expect(aggregatorService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            from: '0xabcdef0000000000000000000000000000000001',
            to: '0xabcdef0000000000000000000000000000000002',
            limit: 5,
            offset: 10,
            order: OrderDirectionEnum.ASC,
          },
        }),
      );
    });

    it('does not drop block 0 from the range', async () => {
      await controller.getLogs({
        startBlock: 0,
        endBlock: 10,
      } as GetLogsRequestDTO);

      expect(aggregatorService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ startBlock: 0, endBlock: 10 }),
      );
    });

    it('maps rows to the response DTO', async () => {
      aggregatorService.getLogs.mockResolvedValue([
        {
          transactionhash: '0xtx',
          blocknumber: 7,
          logindex: 3,
          executeddate: START,
          uploaded: END,
          from: '0xFrom',
          to: '0xTo',
          value: '10',
        },
      ]);

      const result = await controller.getLogs({} as GetLogsRequestDTO);

      expect(result).toEqual([
        {
          transactionHash: '0xtx',
          blockNumber: 7,
          logIndex: 3,
          executedDate: START,
          uploaded: END,
          from: '0xFrom',
          to: '0xTo',
          value: '10',
        },
      ]);
    });
  });

  describe('getTotal', () => {
    it('maps the aggregates to the response DTO', async () => {
      aggregatorService.getTotal.mockResolvedValue({
        firsttransactiondate: START,
        lasttransactiondate: END,
        totaltransactions: '3',
        totalvalue: '300',
        mintransactionvalue: '1',
        maxtransactionvalue: '200',
        firstblocknumber: 10,
        lastblocknumber: 30,
      });

      const result = await controller.getTotal({} as TotalRequestDTO);

      expect(result).toEqual({
        firstTransaction: START,
        lastTransaction: END,
        firstBlock: 10,
        lastBlock: 30,
        totalTransactionsCount: '3',
        totalValue: '300',
        minTransactionValue: '1',
        maxTransactionValue: '200',
      });
    });

    it('answers 400 when there is no data', async () => {
      aggregatorService.getTotal.mockResolvedValue(undefined);

      await expect(controller.getTotal({} as TotalRequestDTO)).rejects.toThrow(
        Errors.NoData,
      );
    });
  });

  describe('getTopAccounts', () => {
    it('forwards ordering and pagination as-is', async () => {
      await controller.getTopAccounts({
        limit: 3,
        offset: 6,
        order: OrderDirectionEnum.ASC,
        orderBy: OrderByEnum.value,
      } as TopAccountsRequestDTO);

      expect(aggregatorService.getTopAccounts).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            limit: 3,
            offset: 6,
            order: OrderDirectionEnum.ASC,
            orderBy: OrderByEnum.value,
          },
        }),
      );
    });

    it('returns an empty list when nothing matches', async () => {
      await expect(
        controller.getTopAccounts({} as TopAccountsRequestDTO),
      ).resolves.toEqual([]);
    });

    it('maps rows to the response DTO', async () => {
      aggregatorService.getTopAccounts.mockResolvedValue([
        { address: '0x1', totalvalue: '500', numberoftransactions: 4 },
      ]);

      const result = await controller.getTopAccounts(
        {} as TopAccountsRequestDTO,
      );

      expect(result).toEqual([
        { address: '0x1', totalValue: '500', totalTransactions: 4 },
      ]);
    });
  });
});
