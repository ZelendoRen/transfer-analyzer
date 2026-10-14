import { ethers } from 'ethers';
import { Test, TestingModule } from '@nestjs/testing';

import { BlockchainService } from '../blockchain/blockchain.service';
import { AnalyzerService } from './analyzer.service';
import { Errors } from '../enum/errors.enum';

const args = { startBlock: '100', endBlock: '200', topicName: 'Transfer' };

describe('AnalyzerService', () => {
  let service: AnalyzerService;
  let blockchainService: jest.Mocked<BlockchainService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyzerService,
        {
          provide: BlockchainService,
          useValue: { getLogs: jest.fn(), parseLog: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AnalyzerService);
    blockchainService = module.get(BlockchainService);
  });

  it('returns an empty list when the node has no logs', async () => {
    blockchainService.getLogs.mockResolvedValue([]);

    await expect(service.getLogs(args)).resolves.toEqual([]);
  });

  it('formats raw logs read from the node', async () => {
    blockchainService.getLogs.mockResolvedValue([
      {
        transactionHash: '0xtx',
        blockNumber: 150,
        blockHash: '0xhash',
        index: 7,
      } as unknown as ethers.Log,
    ]);
    blockchainService.parseLog.mockReturnValue({
      from: '0xFrom',
      to: '0xTo',
      value: BigInt(99),
    });

    await expect(service.getLogs(args)).resolves.toEqual([
      {
        transactionHash: '0xtx',
        blockNumber: 150,
        blockHash: '0xhash',
        logIndex: 7,
        from: '0xFrom',
        to: '0xTo',
        value: '99',
      },
    ]);
  });

  it('forwards the query to the blockchain service', async () => {
    blockchainService.getLogs.mockResolvedValue([]);

    await service.getLogs({ ...args, filter: { from: '0xAlice' } });

    expect(blockchainService.getLogs).toHaveBeenCalledWith({
      ...args,
      filter: { from: '0xAlice' },
    });
  });

  it('maps node failures to an RPC error', async () => {
    blockchainService.getLogs.mockRejectedValue(new Error('down'));

    await expect(service.getLogs(args)).rejects.toThrow(Errors.RPCErrors);
  });

  it('maps parsing failures to an RPC error', async () => {
    blockchainService.getLogs.mockResolvedValue([
      { blockNumber: 1 } as unknown as ethers.Log,
    ]);
    blockchainService.parseLog.mockImplementation(() => {
      throw new Error('bad log');
    });

    await expect(service.getLogs(args)).rejects.toThrow(Errors.RPCErrors);
  });

  it('rejects logs that are not Transfer events', async () => {
    blockchainService.getLogs.mockResolvedValue([
      { blockNumber: 1 } as unknown as ethers.Log,
    ]);
    blockchainService.parseLog.mockReturnValue(undefined);

    await expect(service.getLogs(args)).rejects.toThrow(Errors.RPCErrors);
  });
});
