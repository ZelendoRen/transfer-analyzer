import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { InsertResult, Repository, SelectQueryBuilder } from 'typeorm';

import { TransactionsEntity } from '../database/entity/transactions.entity';
import { OrderByEnum, OrderDirectionEnum } from '../enum/database.enum';
import { Errors } from '../enum/errors.enum';
import {
  FormattedLogType,
  RequestLogType,
  ReturnedLogType,
  TopAccountsResponseType,
  TotalParamsResponseType,
} from '../types/types';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  constructor(
    @InjectRepository(TransactionsEntity)
    private transactionsRepository: Repository<TransactionsEntity>,
    private readonly configService: ConfigService,
  ) {}

  async setTransactions(logs: FormattedLogType[]): Promise<boolean> {
    try {
      if (logs.length === 0) {
        this.logger.log('No logs to insert');
        return false;
      }
      let result: InsertResult;
      this.logger.log(`Inserting ${logs.length} logs to database`);
      const batchSize = 1000;
      for (let i = 0; i < logs.length; i += batchSize) {
        try {
          const batch = logs.slice(i, i + batchSize);
          result = await this.transactionsRepository
            .createQueryBuilder()
            .insert()
            .into(TransactionsEntity)
            .values(batch)
            .orIgnore()
            .execute();
          this.logger.log(`Inserted ${result?.identifiers?.length || 0} logs`);
        } catch (internalError) {
          this.logger.error(internalError);
          throw new Error(Errors.DataBase);
        }
      }
      return true;
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }

  async getHighestProcessedBlock(): Promise<number> {
    try {
      const startBlock: number =
        this.configService.get<number>('START_BLOCK') || 0;
      const result: { maxBlockNumber: number } | undefined =
        await this.transactionsRepository
          .createQueryBuilder('transactions')
          .select('MAX(transactions.blockNumber)', 'maxBlockNumber')
          .getRawOne();
      const highestBlock = result?.maxBlockNumber || 0;
      return Math.max(highestBlock, Number(startBlock));
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }

  // Newest indexed blocks with the hash stored at indexing time.
  async getLatestIndexedBlocks(
    limit: number,
  ): Promise<{ blockNumber: number; blockHash: string }[]> {
    try {
      const rows: { blockNumber: string; blockHash: string }[] =
        await this.transactionsRepository
          .createQueryBuilder('transactions')
          .select('transactions.blockNumber', 'blockNumber')
          .addSelect('transactions.blockHash', 'blockHash')
          .where('transactions.blockHash IS NOT NULL')
          .groupBy('transactions.blockNumber')
          .addGroupBy('transactions.blockHash')
          .orderBy('transactions.blockNumber', 'DESC')
          .limit(limit)
          .getRawMany();
      return rows.map((row) => ({
        blockNumber: Number(row.blockNumber),
        blockHash: row.blockHash,
      }));
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }

  // Deletes transfers from this block upwards (inclusive).
  async deleteFromBlock(blockNumber: number): Promise<void> {
    try {
      await this.transactionsRepository
        .createQueryBuilder()
        .delete()
        .from(TransactionsEntity)
        .where('blockNumber >= :blockNumber', { blockNumber })
        .execute();
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }

  async getLogs(args: RequestLogType): Promise<ReturnedLogType[]> {
    try {
      const query: SelectQueryBuilder<TransactionsEntity> =
        this.transactionsRepository
          .createQueryBuilder('transactions')
          .leftJoinAndSelect('transactions.blocks', 'blocks')
          .select([
            'transactions.transactionHash AS transactionHash',
            'transactions.blockNumber AS blockNumber',
            'transactions.logIndex AS logIndex',
            'transactions.from AS from',
            'transactions.to AS to',
            'transactions.value AS value',
            'transactions.uploaded AS uploaded',
            'blocks.executedDate AS executedDate',
          ])
          .orderBy('transactions.blockNumber', args.filter?.order)
          .limit(args.filter?.limit)
          .offset(args.filter?.offset);

      if (args.startBlock && args.endBlock) {
        query.andWhere('transactions.blockNumber >= :startBlock', {
          startBlock: args.startBlock,
        });
        query.andWhere('transactions.blockNumber <= :endBlock', {
          endBlock: args.endBlock,
        });
      }

      if (args.startDate && args.endDate) {
        query.andWhere('blocks.executedDate >= :startDate', {
          startDate: args.startDate,
        });
        query.andWhere('blocks.executedDate <= :endDate', {
          endDate: args.endDate,
        });
      }

      if (args.filter?.from) {
        query.andWhere('LOWER(transactions.from) = LOWER(:from)', {
          from: args.filter.from,
        });
      }

      if (args.filter?.to) {
        query.andWhere('LOWER(transactions.to) = LOWER(:to)', {
          to: args.filter.to,
        });
      }
      const result = await query.getRawMany<ReturnedLogType>();
      return result;
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }

  async getTotal(
    args: RequestLogType,
  ): Promise<TotalParamsResponseType | undefined> {
    try {
      const query: SelectQueryBuilder<TransactionsEntity> =
        this.transactionsRepository
          .createQueryBuilder('transactions')
          .leftJoinAndSelect('transactions.blocks', 'blocks')
          .select([
            'SUM(transactions.value) AS totalValue',
            'COUNT(transactions.transactionHash) AS totalTransactions',
            'MIN(blocks.executedDate) AS firstTransactionDate',
            'MAX(blocks.executedDate) AS lastTransactionDate',
            'MIN(transactions.value) AS minTransactionValue',
            'MAX(transactions.value) AS maxTransactionValue',
            'MIN(transactions.blockNumber) AS firstBlockNumber',
            'MAX(transactions.blockNumber) AS lastBlockNumber',
          ]);

      if (args.startBlock && args.endBlock) {
        query.andWhere('transactions.blockNumber >= :startBlock', {
          startBlock: args.startBlock,
        });
        query.andWhere('transactions.blockNumber <= :endBlock', {
          endBlock: args.endBlock,
        });
      }
      if (args.startDate && args.endDate) {
        query.andWhere('blocks.executedDate >= :startDate', {
          startDate: args.startDate,
        });
        query.andWhere('blocks.executedDate <= :endDate', {
          endDate: args.endDate,
        });
      }
      return await query.getRawOne<TotalParamsResponseType>();
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }

  async getTopAccounts(
    args: RequestLogType,
  ): Promise<TopAccountsResponseType[]> {
    try {
      const query = this.transactionsRepository
        .createQueryBuilder('transactions')
        .select('transactions.from AS address')
        .addSelect('SUM(transactions.value) AS totalValue')
        .addSelect('COUNT(*) AS numberOfTransactions')
        .leftJoin('transactions.blocks', 'blocks')
        .groupBy('transactions.from')
        .orderBy(
          args.filter?.orderBy || OrderByEnum.value,
          args.filter?.order || OrderDirectionEnum.DESC,
        )
        .limit(args.filter?.limit)
        .offset(args.filter?.offset);

      if (args.startBlock && args.endBlock) {
        query.andWhere('transactions.blockNumber >= :startBlock', {
          startBlock: args.startBlock,
        });
        query.andWhere('transactions.blockNumber <= :endBlock', {
          endBlock: args.endBlock,
        });
      }
      if (args.startDate && args.endDate) {
        query.andWhere('blocks.executedDate >= :startDate', {
          startDate: args.startDate,
        });
        query.andWhere('blocks.executedDate <= :endDate', {
          endDate: args.endDate,
        });
      }
      return await query.getRawMany();
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }
}
