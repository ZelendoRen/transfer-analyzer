import { ethers } from 'ethers';
import { ConfigService } from '@nestjs/config';

import { BlockchainService } from './blockchain.service';
import { Errors } from '../enum/errors.enum';

const mockProvider = {
  getBlockNumber: jest.fn(),
  getLogs: jest.fn(),
  getBlock: jest.fn(),
};

// The real provider would open a network connection on construction.
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: jest.fn(() => mockProvider),
    },
  };
});

const CONTRACT = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E';
const ALICE = '0x1111111111111111111111111111111111111111';
const BOB = '0x2222222222222222222222222222222222222222';
// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad = (address: string) => ethers.zeroPadValue(address, 32);

describe('BlockchainService', () => {
  let service: BlockchainService;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = {
      get: jest.fn((key: string) =>
        key === 'CONTRACT_ADDRESS' ? CONTRACT : 'http://rpc.local',
      ),
    } as unknown as ConfigService;
    service = new BlockchainService(config);
  });

  it('refuses to start without RPC_URL and CONTRACT_ADDRESS', () => {
    const empty = { get: jest.fn() } as unknown as ConfigService;

    expect(() => new BlockchainService(empty)).toThrow(/must be set/);
  });

  it('refuses to start with a malformed contract address', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'CONTRACT_ADDRESS' ? '0x123' : 'http://rpc.local',
      ),
    } as unknown as ConfigService;

    expect(() => new BlockchainService(config)).toThrow(/not a valid address/);
  });

  it('connects to the configured RPC and contract', () => {
    expect(ethers.JsonRpcProvider).toHaveBeenCalledWith('http://rpc.local');
    expect(service.contractAddress).toBe(CONTRACT);
  });

  describe('getCurrentBlockNumber', () => {
    it('returns the head block number', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(123);

      await expect(service.getCurrentBlockNumber()).resolves.toBe(123);
    });

    it('wraps RPC failures', async () => {
      mockProvider.getBlockNumber.mockRejectedValue(new Error('down'));

      await expect(service.getCurrentBlockNumber()).rejects.toThrow(
        Errors.BlockChain,
      );
    });
  });

  describe('getBlockHash', () => {
    it('returns the canonical hash of a block', async () => {
      mockProvider.getBlock.mockResolvedValue({ hash: '0xabc' });

      await expect(service.getBlockHash(10)).resolves.toBe('0xabc');
      expect(mockProvider.getBlock).toHaveBeenCalledWith(10);
    });

    it('returns undefined when the node does not know the block', async () => {
      mockProvider.getBlock.mockResolvedValue(null);

      await expect(service.getBlockHash(10)).resolves.toBeUndefined();
    });

    it('wraps RPC failures', async () => {
      mockProvider.getBlock.mockRejectedValue(new Error('down'));

      await expect(service.getBlockHash(10)).rejects.toThrow(Errors.BlockChain);
    });
  });

  describe('getBlockMintedTimestamp', () => {
    it('returns the block timestamp', async () => {
      mockProvider.getBlock.mockResolvedValue({ timestamp: 1633046400 });

      await expect(service.getBlockMintedTimestamp(10)).resolves.toBe(
        1633046400,
      );
    });

    it('fails instead of returning an undefined timestamp for an unknown block', async () => {
      mockProvider.getBlock.mockResolvedValue(null);

      await expect(service.getBlockMintedTimestamp(10)).rejects.toThrow(
        Errors.BlockChain,
      );
    });

    it('wraps RPC failures', async () => {
      mockProvider.getBlock.mockRejectedValue(new Error('down'));

      await expect(service.getBlockMintedTimestamp(10)).rejects.toThrow(
        Errors.BlockChain,
      );
    });
  });

  describe('getTopic', () => {
    it('returns only the event signature without filters', () => {
      expect(service.getTopic('Transfer')).toEqual([TRANSFER_TOPIC]);
    });

    it('pads the from filter to 32 bytes', () => {
      expect(service.getTopic('Transfer', [ALICE])).toEqual([
        TRANSFER_TOPIC,
        pad(ALICE),
      ]);
    });

    it('keeps the from slot empty for a to-only filter', () => {
      expect(service.getTopic('Transfer', [undefined, BOB])).toEqual([
        TRANSFER_TOPIC,
        null,
        pad(BOB),
      ]);
    });

    it('supports both filters', () => {
      expect(service.getTopic('Transfer', [ALICE, BOB])).toEqual([
        TRANSFER_TOPIC,
        pad(ALICE),
        pad(BOB),
      ]);
    });

    it('rejects unknown events', () => {
      expect(() => service.getTopic('NoSuchEvent')).toThrow(Errors.BlockChain);
    });
  });
  describe('getLogs', () => {
    it('queries the contract for the requested block range and topic', async () => {
      mockProvider.getLogs.mockResolvedValue([]);

      await service.getLogs({
        startBlock: '100',
        endBlock: '200',
        topicName: 'Transfer',
        filter: { to: BOB },
      });

      expect(mockProvider.getLogs).toHaveBeenCalledWith({
        address: CONTRACT,
        fromBlock: 100,
        toBlock: 200,
        topics: [TRANSFER_TOPIC, null, pad(BOB)],
      });
    });

    it('defaults the end of the range to the head block', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(500);
      mockProvider.getLogs.mockResolvedValue([]);

      await service.getLogs({ startBlock: '100', topicName: 'Transfer' });

      expect(mockProvider.getLogs).toHaveBeenCalledWith(
        expect.objectContaining({ fromBlock: 100, toBlock: 500 }),
      );
    });

    it('lets RPC errors through untouched so callers can inspect the code', async () => {
      const rpcError = { error: { code: -32000 } };
      mockProvider.getLogs.mockRejectedValue(rpcError);

      await expect(
        service.getLogs({
          startBlock: '1',
          endBlock: '2',
          topicName: 'Transfer',
        }),
      ).rejects.toBe(rpcError);
    });
  });

  describe('parseLog', () => {
    const transferLog = (value: bigint) =>
      ({
        topics: [TRANSFER_TOPIC, pad(ALICE), pad(BOB)],
        data: ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [value]),
      }) as unknown as ethers.Log;

    it('decodes a Transfer event', () => {
      const args = service.parseLog(transferLog(1_500_000n));

      expect(args?.from.toLowerCase()).toBe(ALICE);
      expect(args?.to.toLowerCase()).toBe(BOB);
      expect(args?.value).toBe(1_500_000n);
    });

    it('returns undefined for a log of another event', () => {
      const foreign = {
        topics: [ethers.id('Foo(uint256)')],
        data: '0x',
      } as unknown as ethers.Log;

      expect(service.parseLog(foreign)).toBeUndefined();
    });
  });
});
