import { ethers } from 'ethers';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { BlockchainService } from '../blockchain/blockchain.service';
import { TransactionsService } from '../repository/transactions.service';
import { BlocksService } from '../repository/blocks.service';
import { AggregatorService } from './aggregator.service';
import { FormattedLogType } from '../types/types';
import { Errors } from '../enum/errors.enum';

type Config = Record<string, unknown>;

const formattedLog = (
  blockNumber: number,
  overrides: Partial<FormattedLogType> = {},
): FormattedLogType => ({
  blockNumber,
  blockHash: `0xhash${blockNumber}`,
  logIndex: 0,
  transactionHash: `0xtx${blockNumber}`,
  from: '0x123',
  to: '0x456',
  value: '1000',
  ...overrides,
});

const rawLog = (blockNumber: number) =>
  ({
    blockNumber,
    blockHash: `0xhash${blockNumber}`,
    index: 0,
    transactionHash: `0xtx${blockNumber}`,
  }) as unknown as ethers.Log;

describe('AggregatorService', () => {
  let service: AggregatorService;
  let blocksService: jest.Mocked<BlocksService>;
  let transactionsService: jest.Mocked<TransactionsService>;
  let blockchainService: jest.Mocked<BlockchainService>;

  // Every test gets fresh mocks, otherwise implementations leak between tests.
  const build = async (config: Config = {}) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AggregatorService,
        {
          provide: BlocksService,
          useValue: {
            getBlockWithoutDate: jest.fn(),
            setExecutionDate: jest.fn().mockResolvedValue({}),
            addBlocks: jest.fn().mockResolvedValue(undefined),
            deleteFromBlock: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TransactionsService,
          useValue: {
            getHighestProcessedBlock: jest.fn().mockResolvedValue(100),
            getLatestIndexedBlocks: jest.fn().mockResolvedValue([]),
            deleteFromBlock: jest.fn().mockResolvedValue(undefined),
            setTransactions: jest.fn().mockResolvedValue(true),
            getLogs: jest.fn(),
            getTotal: jest.fn(),
            getTopAccounts: jest.fn(),
          },
        },
        {
          provide: BlockchainService,
          useValue: {
            getCurrentBlockNumber: jest.fn().mockResolvedValue(1000),
            getBlockMintedTimestamp: jest.fn(),
            getBlockHash: jest.fn(),
            getLogs: jest.fn().mockResolvedValue([]),
            parseLog: jest.fn(),
            contractAddress: '0xContract',
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => config[key]) },
        },
      ],
    }).compile();

    service = module.get(AggregatorService);
    blocksService = module.get(BlocksService);
    transactionsService = module.get(TransactionsService);
    blockchainService = module.get(BlockchainService);
  };

  beforeEach(async () => {
    await build({ BATCH_SIZE: 1000 });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('collectTimestamps', () => {
    it('does nothing while the previous iteration is still running', async () => {
      service['isProcessingTimestamps'] = true;

      await service.collectTimestamps();

      expect(blocksService.getBlockWithoutDate).not.toHaveBeenCalled();
    });

    it('does not call the node when every block already has a date', async () => {
      blocksService.getBlockWithoutDate.mockResolvedValue(undefined);

      await service.collectTimestamps();

      expect(blockchainService.getBlockMintedTimestamp).not.toHaveBeenCalled();
      expect(blocksService.setExecutionDate).not.toHaveBeenCalled();
      expect(service['isProcessingTimestamps']).toBe(false);
    });

    it('stores the block timestamp as the execution date', async () => {
      blocksService.getBlockWithoutDate.mockResolvedValue(123);
      blockchainService.getBlockMintedTimestamp.mockResolvedValue(1633046400);

      await service.collectTimestamps();

      expect(blocksService.setExecutionDate).toHaveBeenCalledWith({
        blockNumber: 123,
        executedDate: new Date(1633046400000),
      });
      expect(service['isProcessingTimestamps']).toBe(false);
    });

    it('swallows errors and releases the lock', async () => {
      blocksService.getBlockWithoutDate.mockResolvedValue(123);
      blockchainService.getBlockMintedTimestamp.mockRejectedValue(new Error());

      await expect(service.collectTimestamps()).resolves.toBeUndefined();

      expect(blocksService.setExecutionDate).not.toHaveBeenCalled();
      expect(service['isProcessingTimestamps']).toBe(false);
    });
  });

  describe('collectData', () => {
    it('does nothing while the previous iteration is still running', async () => {
      service['isProcessingTransactions'] = true;

      await service.collectData();

      expect(blockchainService.getCurrentBlockNumber).not.toHaveBeenCalled();
    });

    it('starts from the highest processed block', async () => {
      transactionsService.getHighestProcessedBlock.mockResolvedValue(500);
      blockchainService.getCurrentBlockNumber.mockResolvedValue(10_000);

      await service.collectData();

      expect(blockchainService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ startBlock: '500' }),
      );
    });

    it('indexes only confirmed blocks (head - CONFIRMATIONS)', async () => {
      blockchainService.getCurrentBlockNumber.mockResolvedValue(1000);

      await service.collectData();

      // default confirmations = 12 -> last indexable block is 988
      expect(blockchainService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ startBlock: '100', endBlock: '988' }),
      );
    });

    it('honours a custom CONFIRMATIONS value, including 0', async () => {
      await build({ BATCH_SIZE: 1000, CONFIRMATIONS: '0' });
      blockchainService.getCurrentBlockNumber.mockResolvedValue(1000);

      await service.collectData();

      expect(blockchainService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ endBlock: '1000' }),
      );
    });

    it('falls back to the default for an invalid CONFIRMATIONS value', async () => {
      await build({ BATCH_SIZE: 1000, CONFIRMATIONS: 'abc' });

      expect(service['confirmations']).toBe(12);
    });

    it('limits one iteration to BATCH_SIZE blocks', async () => {
      await build({ BATCH_SIZE: 50 });
      blockchainService.getCurrentBlockNumber.mockResolvedValue(10_000);

      await service.collectData();

      expect(blockchainService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ startBlock: '100', endBlock: '149' }),
      );
      expect(service['nextBlock']).toBe(150);
    });

    it('waits when the next block is not confirmed yet', async () => {
      transactionsService.getHighestProcessedBlock.mockResolvedValue(995);
      blockchainService.getCurrentBlockNumber.mockResolvedValue(1000);

      await service.collectData();

      expect(blockchainService.getLogs).not.toHaveBeenCalled();
      expect(service['nextBlock']).toBe(995);
    });

    it('stores blocks and transfers and moves past the processed range', async () => {
      const logs = [formattedLog(101), formattedLog(102, { logIndex: 3 })];
      blockchainService.getLogs.mockResolvedValue([rawLog(101), rawLog(102)]);
      jest.spyOn(service, 'formatLogs').mockReturnValue(logs);

      await service.collectData();

      expect(blocksService.addBlocks).toHaveBeenCalledWith([
        { blockNumber: 101, executedDate: undefined },
        { blockNumber: 102, executedDate: undefined },
      ]);
      expect(transactionsService.setTransactions).toHaveBeenCalledWith(logs);
      expect(service['nextBlock']).toBe(989);
    });

    it('advances over ranges without transfers', async () => {
      await service.collectData();

      expect(blocksService.addBlocks).not.toHaveBeenCalled();
      expect(transactionsService.setTransactions).not.toHaveBeenCalled();
      expect(service['nextBlock']).toBe(989);
    });

    it('does not re-request the confirmed range on the next tick', async () => {
      await service.collectData();
      blockchainService.getLogs.mockClear();

      await service.collectData();

      expect(blockchainService.getLogs).not.toHaveBeenCalled();
    });

    it('keeps the position when the batch fails, so it is retried', async () => {
      blockchainService.getLogs.mockRejectedValue(new Error('boom'));

      await expect(service.collectData()).resolves.toBeUndefined();

      expect(service['nextBlock']).toBe(100);
      expect(service['isProcessingTransactions']).toBe(false);
    });

    it('releases the lock when the initial lookup fails', async () => {
      transactionsService.getHighestProcessedBlock.mockRejectedValue(
        new Error('db down'),
      );

      await service.collectData();

      expect(service['isProcessingTransactions']).toBe(false);
    });
  });

  describe('handleReorg', () => {
    beforeEach(() => {
      service['nextBlock'] = 990;
    });

    it('does not touch the node when nothing is indexed yet', async () => {
      await service.handleReorg(1000);

      expect(blockchainService.getBlockHash).not.toHaveBeenCalled();
    });

    it('treats blocks far behind the head as final', async () => {
      transactionsService.getLatestIndexedBlocks.mockResolvedValue([
        { blockNumber: 100, blockHash: '0xold' },
      ]);

      await service.handleReorg(1000);

      expect(blockchainService.getBlockHash).not.toHaveBeenCalled();
    });

    it('keeps the data when the newest block hash is still canonical', async () => {
      transactionsService.getLatestIndexedBlocks.mockResolvedValue([
        { blockNumber: 985, blockHash: '0xa' },
        { blockNumber: 980, blockHash: '0xb' },
      ]);
      blockchainService.getBlockHash.mockResolvedValue('0xa');

      await service.handleReorg(1000);

      expect(blockchainService.getBlockHash).toHaveBeenCalledTimes(1);
      expect(transactionsService.deleteFromBlock).not.toHaveBeenCalled();
      expect(service['nextBlock']).toBe(990);
    });

    it('rolls back to the fork point and rewinds the cursor', async () => {
      transactionsService.getLatestIndexedBlocks.mockResolvedValue([
        { blockNumber: 985, blockHash: '0xstale985' },
        { blockNumber: 982, blockHash: '0xstale982' },
        { blockNumber: 980, blockHash: '0xok980' },
        { blockNumber: 970, blockHash: '0xok970' },
      ]);
      blockchainService.getBlockHash.mockImplementation(
        async (blockNumber) => `0xok${blockNumber}`,
      );

      await service.handleReorg(1000);

      // 985 and 982 differ, 980 matches -> the fork starts at 982
      expect(transactionsService.deleteFromBlock).toHaveBeenCalledWith(982);
      expect(blocksService.deleteFromBlock).toHaveBeenCalledWith(982);
      expect(service['nextBlock']).toBe(982);
      expect(blockchainService.getBlockHash).toHaveBeenCalledTimes(3);
    });

    it('treats a block missing on the node as reorged', async () => {
      transactionsService.getLatestIndexedBlocks.mockResolvedValue([
        { blockNumber: 985, blockHash: '0xa' },
      ]);
      blockchainService.getBlockHash.mockResolvedValue(undefined);

      await service.handleReorg(1000);

      expect(transactionsService.deleteFromBlock).toHaveBeenCalledWith(985);
    });

    it('deletes transfers before blocks (foreign key order)', async () => {
      const order: string[] = [];
      transactionsService.getLatestIndexedBlocks.mockResolvedValue([
        { blockNumber: 985, blockHash: '0xa' },
      ]);
      blockchainService.getBlockHash.mockResolvedValue('0xother');
      transactionsService.deleteFromBlock.mockImplementation(async () => {
        order.push('transactions');
      });
      blocksService.deleteFromBlock.mockImplementation(async () => {
        order.push('blocks');
      });

      await service.handleReorg(1000);

      expect(order).toEqual(['transactions', 'blocks']);
    });

    it('re-indexes the rolled back range in the same iteration', async () => {
      transactionsService.getHighestProcessedBlock.mockResolvedValue(990);
      transactionsService.getLatestIndexedBlocks.mockResolvedValue([
        { blockNumber: 985, blockHash: '0xstale' },
      ]);
      blockchainService.getBlockHash.mockResolvedValue('0xcanonical');
      blockchainService.getCurrentBlockNumber.mockResolvedValue(1000);
      service['nextBlock'] = undefined;

      await service.collectData();

      expect(blockchainService.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ startBlock: '985', endBlock: '988' }),
      );
    });
  });

  describe('getLogsData', () => {
    beforeEach(() => {
      service['nextBlock'] = 100;
    });

    it('asks the node for the head when no safe head is passed', async () => {
      blockchainService.getCurrentBlockNumber.mockResolvedValue(200);

      const result = await service.getLogsData(1000);

      expect(result).toEqual({ logs: [], endBlock: 188 });
    });

    it('returns formatted logs and the end block', async () => {
      const logs = [formattedLog(101)];
      blockchainService.getLogs.mockResolvedValue([rawLog(101)]);
      jest.spyOn(service, 'formatLogs').mockReturnValue(logs);

      const result = await service.getLogsData(100, 500);

      expect(result).toEqual({ logs, endBlock: 199 });
    });

    it('asks only for the contract address and the Transfer topic', async () => {
      await service.getLogsData(100, 500);

      expect(blockchainService.getLogs).toHaveBeenCalledWith({
        startBlock: '100',
        endBlock: '199',
        topicName: 'Transfer',
        address: '0xContract',
      });
    });

    it('retries with half of the range when the node rejects it', async () => {
      jest.useFakeTimers();
      blockchainService.getLogs
        .mockRejectedValueOnce({ error: { code: -32000 } })
        .mockResolvedValueOnce([]);

      const pending = service.getLogsData(100, 500);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await pending;

      expect(blockchainService.getLogs).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ startBlock: '100', endBlock: '149' }),
      );
      expect(result.endBlock).toBe(149);
    });

    it('gives up when even a single block is rejected', async () => {
      blockchainService.getLogs.mockRejectedValue({ error: { code: -32000 } });

      await expect(service.getLogsData(1, 500)).rejects.toThrow(Errors.GetLogs);
    });

    it('fails fast on errors that shrinking would not fix', async () => {
      blockchainService.getLogs.mockRejectedValue(new Error('Test error'));

      await expect(service.getLogsData(100, 500)).rejects.toThrow(
        Errors.GetLogs,
      );
      expect(blockchainService.getLogs).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatLogs', () => {
    it('maps parsed logs, keeping the block hash for reorg checks', () => {
      blockchainService.parseLog.mockReturnValue({
        from: '0xFrom',
        to: '0xTo',
        value: BigInt(42),
      });

      const result = service.formatLogs([rawLog(101)]);

      expect(result).toEqual([
        {
          blockNumber: 101,
          blockHash: '0xhash101',
          logIndex: 0,
          transactionHash: '0xtx101',
          from: '0xFrom',
          to: '0xTo',
          value: '42',
        },
      ]);
    });

    it('throws a formatting error if a log cannot be parsed', () => {
      blockchainService.parseLog.mockImplementation(() => {
        throw new Error('Test error');
      });

      expect(() => service.formatLogs([rawLog(101)])).toThrow(
        Errors.FormattingLogError,
      );
    });

    it('refuses to store a log that is not a Transfer event', () => {
      blockchainService.parseLog.mockReturnValue(undefined);

      expect(() => service.formatLogs([rawLog(101)])).toThrow(
        Errors.FormattingLogError,
      );
    });
  });

  describe('read API', () => {
    const args = { startBlock: 100, endBlock: 200 };

    it('getLogs returns the stored logs', async () => {
      transactionsService.getLogs.mockResolvedValue([]);

      await expect(service.getLogs(args)).resolves.toEqual([]);
      expect(transactionsService.getLogs).toHaveBeenCalledWith(args);
    });

    it('getLogs maps storage failures to a database error', async () => {
      transactionsService.getLogs.mockRejectedValue(new Error('x'));

      await expect(service.getLogs(args)).rejects.toThrow(Errors.DataBase);
    });

    it('getTotal returns totals from the repository', async () => {
      const total = { totaltransactions: '1' } as never;
      transactionsService.getTotal.mockResolvedValue(total);

      await expect(service.getTotal(args)).resolves.toBe(total);
    });

    it('getTotal maps storage failures to a database error', async () => {
      transactionsService.getTotal.mockRejectedValue(new Error('x'));

      await expect(service.getTotal(args)).rejects.toThrow(Errors.DataBase);
    });

    it('getTopAccounts returns accounts from the repository', async () => {
      const accounts = [
        { address: '0x1', totalvalue: '5', numberoftransactions: 1 },
      ];
      transactionsService.getTopAccounts.mockResolvedValue(accounts);

      await expect(service.getTopAccounts(args)).resolves.toBe(accounts);
    });

    it('getTopAccounts maps storage failures to a database error', async () => {
      transactionsService.getTopAccounts.mockRejectedValue(new Error('x'));

      await expect(service.getTopAccounts(args)).rejects.toThrow(
        Errors.DataBase,
      );
    });
  });
});
