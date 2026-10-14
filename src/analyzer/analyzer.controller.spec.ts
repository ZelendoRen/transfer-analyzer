import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AnalyzerController } from './analyzer.controller';
import { AnalyzerService } from './analyzer.service';
import { GetLogsRequestDTO } from './dto/getLogs.dto';

const query = (overrides: Partial<GetLogsRequestDTO> = {}) =>
  ({
    startBlock: 100,
    endBlock: 200,
    topicName: 'Transfer',
    ...overrides,
  }) as GetLogsRequestDTO;

describe('AnalyzerController', () => {
  let controller: AnalyzerController;
  let analyzerService: jest.Mocked<AnalyzerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyzerController],
      providers: [
        { provide: AnalyzerService, useValue: { getLogs: jest.fn() } },
      ],
    }).compile();

    controller = module.get(AnalyzerController);
    analyzerService = module.get(AnalyzerService);
  });

  it('returns the logs mapped to the response DTO', async () => {
    analyzerService.getLogs.mockResolvedValue([
      {
        transactionHash: '0xtx',
        blockNumber: 150,
        blockHash: '0xhash',
        logIndex: 2,
        from: '0xFrom',
        to: '0xTo',
        value: '10',
      },
    ]);

    const result = await controller.getLogs(query());

    expect(result).toEqual([
      {
        transactionHash: '0xtx',
        blockNumber: 150,
        logIndex: 2,
        from: '0xFrom',
        to: '0xTo',
        value: '10',
      },
    ]);
    expect(analyzerService.getLogs).toHaveBeenCalledWith({
      startBlock: '100',
      endBlock: '200',
      topicName: 'Transfer',
      filter: { from: undefined, to: undefined },
    });
  });

  it('rejects a request without a block range', async () => {
    await expect(
      controller.getLogs(query({ endBlock: undefined })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(analyzerService.getLogs).not.toHaveBeenCalled();
  });

  it('rejects an inverted block range', async () => {
    await expect(
      controller.getLogs(query({ startBlock: 300, endBlock: 200 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 500 when the node fails', async () => {
    analyzerService.getLogs.mockRejectedValue(new Error('down'));

    await expect(controller.getLogs(query())).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
