import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { FormattedLogType, GetBlockParamsType } from '../types/types';
import { BlockchainService } from '../blockchain/blockchain.service';
import { Errors } from '../enum/errors.enum';

@Injectable()
export class AnalyzerService {
  private readonly logger = new Logger(AnalyzerService.name);
  constructor(private readonly blockchainService: BlockchainService) {}

  async getLogs(args: GetBlockParamsType): Promise<FormattedLogType[]> {
    try {
      const logs: ethers.Log[] = await this.blockchainService.getLogs(args);

      return logs.map((log: ethers.Log) => {
        const transfer = this.blockchainService.parseLog(log);
        if (!transfer) {
          throw new Error(
            `Log ${log.transactionHash}#${log.index} is not a Transfer event`,
          );
        }
        return {
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
          blockHash: log.blockHash,
          logIndex: log.index,
          from: transfer.from,
          to: transfer.to,
          value: transfer.value.toString(),
        };
      });
    } catch (error) {
      this.logger.error(error);
      throw new Error(Errors.RPCErrors);
    }
  }
}
