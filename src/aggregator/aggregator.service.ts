import { ethers } from 'ethers';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';

import { TransactionsService } from '../repository/transactions.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { BlocksService } from '../repository/blocks.service';
import { TopicNames } from '../enum/blockchain.enum';
import { Errors } from '../enum/errors.enum';
import {
  BlocksInsertParamsType,
  FormattedLogType,
  GetBlockParamsType,
  RequestLogType,
  ReturnedLogType,
  TopAccountsResponseType,
  TotalParamsResponseType,
} from '../types/types';

const cronPatterns = {
  collectTimestamps: '*/1 * * * * *',
  collectData: '*/5 * * * * *',
};

const DEFAULT_BATCH_SIZE = 2000;
const DEFAULT_CONFIRMATIONS = 12;
// Stored blocks within this distance of the head are re-checked for reorgs.
const DEFAULT_REORG_WINDOW = 256;
// Max stored blocks to walk back when looking for the fork.
const REORG_MAX_DEPTH = 100;
// RPC codes meaning the range or response is too large.
const RANGE_TOO_LARGE_CODES = [-32000, -32005, -32602];
const RETRY_DELAY_MS = 10_000;

const isRangeTooLarge = (error: unknown): boolean => {
  const code = (error as { error?: { code?: number } } | undefined)?.error
    ?.code;
  return code !== undefined && RANGE_TOO_LARGE_CODES.includes(code);
};

@Injectable()
export class AggregatorService {
  private nextBlock: number | undefined;
  private batchSize: number;
  private confirmations: number;
  private reorgWindow: number;
  private isProcessingTransactions: boolean = false;
  private isProcessingTimestamps: boolean = false;
  private readonly logger = new Logger(AggregatorService.name);

  constructor(
    private readonly blocksService: BlocksService,
    private readonly transactionsService: TransactionsService,
    private readonly blockchainService: BlockchainService,
    private readonly configService: ConfigService,
  ) {
    this.batchSize =
      Number(this.configService.get<number>('BATCH_SIZE')) ||
      DEFAULT_BATCH_SIZE;
    const confirmations = Number(this.configService.get('CONFIRMATIONS'));
    this.confirmations =
      Number.isInteger(confirmations) && confirmations >= 0
        ? confirmations
        : DEFAULT_CONFIRMATIONS;
    this.reorgWindow =
      Number(this.configService.get<number>('REORG_WINDOW')) ||
      DEFAULT_REORG_WINDOW;
  }

  @Cron(cronPatterns.collectTimestamps)
  async collectTimestamps(): Promise<void> {
    if (this.isProcessingTimestamps) {
      return;
    }
    this.isProcessingTimestamps = true;
    try {
      const blockNumber: number | undefined =
        await this.blocksService.getBlockWithoutDate();
      if (!blockNumber) {
        this.logger.log(
          'No blocks without timestamp. Waiting for next cron iteration',
        );
        return;
      }
      this.logger.log(`Getting execution date for block ${blockNumber}`);
      const mintedTime: number =
        await this.blockchainService.getBlockMintedTimestamp(blockNumber);
      const executedDate: Date = new Date(mintedTime * 1000);
      this.logger.log(
        `Execution date for block ${blockNumber} is ${executedDate.toISOString()}`,
      );
      const blockData: BlocksInsertParamsType = {
        blockNumber: blockNumber,
        executedDate: executedDate,
      };
      await this.blocksService.setExecutionDate(blockData);
      this.logger.log(
        `Inserted execution date for block ${blockNumber} is successful`,
      );
    } catch (error) {
      this.logger.error(error);
    } finally {
      this.logger.log(
        'Finished processing timestamps. Waiting for next cron iteration',
      );
      this.isProcessingTimestamps = false;
    }
  }

  @Cron(cronPatterns.collectData)
  async collectData(): Promise<void> {
    if (this.isProcessingTransactions) {
      return;
    }
    this.isProcessingTransactions = true;

    try {
      if (this.nextBlock === undefined) {
        this.nextBlock =
          await this.transactionsService.getHighestProcessedBlock();
      }
      const head: number = await this.blockchainService.getCurrentBlockNumber();
      await this.handleReorg(head);

      const safeHead: number = head - this.confirmations;
      const fromBlock: number = this.nextBlock;
      if (fromBlock > safeHead) {
        this.logger.log(
          `Block ${fromBlock} has no ${this.confirmations} confirmations yet (head ${head}). Waiting`,
        );
        return;
      }
      this.logger.log(`Starting processing logs from block ${fromBlock}`);

      const formatLogs: { logs: FormattedLogType[]; endBlock: number } =
        await this.getLogsData(this.batchSize, safeHead);
      if (formatLogs.logs.length === 0) {
        this.logger.log('No logs to process. Exiting function');
        this.nextBlock = formatLogs.endBlock + 1;
        return;
      }
      const blocksData: BlocksInsertParamsType[] = formatLogs.logs.map(
        (log) => ({
          blockNumber: log.blockNumber,
          executedDate: undefined,
        }),
      );
      await this.blocksService.addBlocks(blocksData);
      await this.transactionsService.setTransactions(formatLogs.logs);
      this.nextBlock = formatLogs.endBlock + 1;
    } catch (error) {
      this.logger.error(error);
    } finally {
      this.logger.log('Finished processing. Waiting for next cron iteration');
      this.isProcessingTransactions = false;
    }
  }

  // Hashes are chained: if the newest stored block still matches, all older
  // ones do too. On a mismatch, walk back to the fork and roll back from there.
  async handleReorg(head: number): Promise<void> {
    const recent =
      await this.transactionsService.getLatestIndexedBlocks(REORG_MAX_DEPTH);
    if (
      recent.length === 0 ||
      head - recent[0].blockNumber > this.reorgWindow
    ) {
      return;
    }

    let forkBlock: number | undefined;
    for (const block of recent) {
      const canonicalHash = await this.blockchainService.getBlockHash(
        block.blockNumber,
      );
      if (canonicalHash === block.blockHash) {
        break;
      }
      forkBlock = block.blockNumber;
    }
    if (forkBlock === undefined) {
      return;
    }

    this.logger.warn(
      `Reorg detected: indexed data is stale from block ${forkBlock}. Rolling back`,
    );
    await this.transactionsService.deleteFromBlock(forkBlock);
    await this.blocksService.deleteFromBlock(forkBlock);
    this.nextBlock = forkBlock;
  }

  async getLogsData(
    iterationBatchSize: number,
    safeHead?: number,
  ): Promise<{ logs: FormattedLogType[]; endBlock: number }> {
    const lastBlock: number =
      safeHead ??
      (await this.blockchainService.getCurrentBlockNumber()) -
        this.confirmations;
    const batchSize: number = iterationBatchSize || this.batchSize;
    const startBlock: number = this.nextBlock as number;
    const endBlock: number = Math.min(startBlock + batchSize - 1, lastBlock);
    try {
      this.logger.log(`Getting logs from ${startBlock} to ${endBlock}`);
      const args: GetBlockParamsType = {
        startBlock: startBlock.toString(),
        endBlock: endBlock.toString(),
        topicName: TopicNames.Transfer,
        address: this.blockchainService.contractAddress,
      };
      const logs: ethers.Log[] = await this.blockchainService.getLogs(args);
      if (logs.length === 0) {
        return {
          logs: [],
          endBlock,
        };
      }
      this.logger.log(
        `Got ${logs.length} logs. Starting formatting and inserting`,
      );
      const formattedLogs: FormattedLogType[] = this.formatLogs(logs);
      return {
        logs: formattedLogs,
        endBlock,
      };
    } catch (error) {
      this.logger.error(error);
      const nextBatchSize = Math.floor(batchSize / 2);
      if (isRangeTooLarge(error) && nextBatchSize >= 1) {
        // Range refused: retry with half of it.
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return await this.getLogsData(nextBatchSize, safeHead);
      }
      throw new Error(Errors.GetLogs);
    }
  }

  formatLogs(logs: ethers.Log[]): FormattedLogType[] {
    try {
      const formattedLogs: FormattedLogType[] = [];
      for (const log of logs) {
        const args = this.blockchainService.parseLog(log);
        if (!args) {
          throw new Error(`Log # is not a Transfer event`);
        }
        formattedLogs.push({
          blockNumber: log.blockNumber,
          blockHash: log.blockHash,
          logIndex: log.index,
          transactionHash: log.transactionHash,
          from: args.from,
          to: args.to,
          value: args.value.toString(),
        });
      }
      return formattedLogs;
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.FormattingLogError);
    }
  }

  async getLogs(args: RequestLogType): Promise<ReturnedLogType[]> {
    try {
      return await this.transactionsService.getLogs(args);
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }

  async getTotal(
    args: RequestLogType,
  ): Promise<TotalParamsResponseType | undefined> {
    try {
      return await this.transactionsService.getTotal(args);
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }

  async getTopAccounts(
    args: RequestLogType,
  ): Promise<TopAccountsResponseType[] | undefined> {
    try {
      return await this.transactionsService.getTopAccounts(args);
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }
}
