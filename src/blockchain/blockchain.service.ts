import { ethers } from 'ethers';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { GetBlockParamsType, TransferArgs } from '../types/types';
import * as abi from './abi/ERC20.abi.json';
import { Errors } from '../enum/errors.enum';

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.JsonRpcProvider;
  public readonly contractAddress: string;
  private contract: ethers.Contract;

  constructor(configService: ConfigService) {
    const rpcUrl = configService.get<string>('RPC_URL');
    const contractAddress = configService.get<string>('CONTRACT_ADDRESS');
    if (!rpcUrl || !contractAddress) {
      throw new Error(
        'RPC_URL and CONTRACT_ADDRESS must be set. Copy .env.example to .env and fill them in.',
      );
    }
    if (!ethers.isAddress(contractAddress)) {
      throw new Error(
        `CONTRACT_ADDRESS is not a valid address: ${String(contractAddress)}`,
      );
    }
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contractAddress = contractAddress;
    this.contract = new ethers.Contract(
      this.contractAddress,
      abi,
      this.provider,
    );
  }

  async getCurrentBlockNumber(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.BlockChain);
    }
  }

  parseLog(log: ethers.Log): TransferArgs | undefined {
    try {
      return this.contract.interface.parseLog(log)?.args as unknown as
        | TransferArgs
        | undefined;
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.BlockChain);
    }
  }

  async getLogs(args: GetBlockParamsType): Promise<ethers.Log[]> {
    // RPC errors are not wrapped: the aggregator reads the error code.
    return await this.provider.getLogs({
      address: this.contractAddress,
      fromBlock: parseInt(args.startBlock),
      toBlock: args.endBlock
        ? parseInt(args.endBlock)
        : await this.provider.getBlockNumber(),
      topics: this.getTopic(args.topicName, [
        args.filter?.from,
        args.filter?.to,
      ]),
    });
  }

  async getBlockMintedTimestamp(blockNumber: number): Promise<number> {
    try {
      const block = await this.provider.getBlock(Number(blockNumber));
      if (!block) {
        throw new Error(`Block ${blockNumber} not found`);
      }
      return block.timestamp;
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.BlockChain);
    }
  }

  // Current canonical hash, compared with the stored one to detect reorgs.
  async getBlockHash(blockNumber: number): Promise<string | undefined> {
    try {
      const block = await this.provider.getBlock(Number(blockNumber));
      return block?.hash ?? undefined;
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.BlockChain);
    }
  }

  // Topics are positional (signature, from, to): an unset filter stays null.
  getTopic(
    topicName: string,
    filters: Array<string | undefined> = [],
  ): Array<string | null> {
    let topic: string | undefined;
    try {
      topic = this.contract.interface.getEvent(topicName)?.topicHash;
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.BlockChain);
    }
    if (!topic) {
      this.logger.error(`Topic ${topicName} not found`);
      throw new Error(Errors.BlockChain);
    }

    const padded: Array<string | null> = filters.map((filter) =>
      filter ? ethers.zeroPadValue(filter, 32) : null,
    );
    while (padded.length > 0 && padded[padded.length - 1] === null) {
      padded.pop();
    }
    return [topic, ...padded];
  }
}
