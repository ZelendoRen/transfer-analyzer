import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, UpdateResult } from 'typeorm';

import { BlocksEntity } from '../database/entity/blocks.entity';
import { BlocksInsertParamsType } from '../types/types';
import { Errors } from '../enum/errors.enum';

@Injectable()
export class BlocksService {
  private readonly logger = new Logger(BlocksService.name);
  constructor(
    @InjectRepository(BlocksEntity)
    private readonly blocksRepository: Repository<BlocksEntity>,
  ) {}

  async addBlocks(blocks: BlocksInsertParamsType[]): Promise<void> {
    try {
      await this.blocksRepository
        .createQueryBuilder()
        .insert()
        .into(BlocksEntity)
        .values(blocks)
        .orIgnore()
        .execute();
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }

  async setExecutionDate(
    blocks: BlocksInsertParamsType,
  ): Promise<UpdateResult> {
    try {
      return await this.blocksRepository
        .createQueryBuilder()
        .update()
        .set(blocks)
        .where('blockNumber = :blockNumber', {
          blockNumber: blocks.blockNumber,
        })
        .execute();
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }
  async deleteFromBlock(blockNumber: number): Promise<void> {
    try {
      await this.blocksRepository
        .createQueryBuilder()
        .delete()
        .from(BlocksEntity)
        .where('blockNumber >= :blockNumber', { blockNumber })
        .execute();
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }

  async getBlockWithoutDate(): Promise<number | undefined> {
    try {
      const result: { blockNumber: string } | undefined =
        await this.blocksRepository
          .createQueryBuilder('blocks')
          .select('blocks.blockNumber', 'blockNumber')
          .where('blocks.executedDate IS NULL')
          .getRawOne();
      // bigint arrives from PostgreSQL as a string
      return result ? Number(result.blockNumber) : undefined;
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.DataBase);
    }
  }
}
