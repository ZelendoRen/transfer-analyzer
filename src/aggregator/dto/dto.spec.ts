import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { GetLogsRequestDTO } from './getLogs.dto';
import { TopAccountsRequestDTO } from './topAccounts.dto';
import { TotalRequestDTO } from './total.dto';
import { OrderByEnum, OrderDirectionEnum } from '../../enum/database.enum';

const parse = async <T extends object>(
  cls: new () => T,
  query: Record<string, string>,
) => {
  const dto = plainToInstance(cls, query);
  return { dto, errors: await validate(dto) };
};

describe('query DTOs', () => {
  describe('GetLogsRequestDTO', () => {
    it('applies defaults when the query is empty', async () => {
      const { dto, errors } = await parse(GetLogsRequestDTO, {});

      expect(errors).toHaveLength(0);
      expect(dto).toMatchObject({
        limit: 23,
        offset: 0,
        order: OrderDirectionEnum.DESC,
      });
    });

    it('turns millisecond timestamps into ISO dates', async () => {
      const { dto, errors } = await parse(GetLogsRequestDTO, {
        startDate: '1620000000000',
        endDate: '1620086400000',
      });

      expect(errors).toHaveLength(0);
      expect(dto.startDate).toBe('2021-05-03T00:00:00.000Z');
      expect(dto.endDate).toBe('2021-05-04T00:00:00.000Z');
    });

    it('answers a validation error, not a crash, for a garbage date', async () => {
      const { errors } = await parse(GetLogsRequestDTO, { endDate: 'abc' });

      expect(errors.map((e) => e.property)).toContain('endDate');
    });

    it('accepts the order in any case', async () => {
      const { dto, errors } = await parse(GetLogsRequestDTO, { order: 'asc' });

      expect(errors).toHaveLength(0);
      expect(dto.order).toBe(OrderDirectionEnum.ASC);
    });

    it('rejects an unknown order', async () => {
      const { errors } = await parse(GetLogsRequestDTO, { order: 'sideways' });

      expect(errors.map((e) => e.property)).toContain('order');
    });

    it('rejects a limit above the maximum', async () => {
      const { errors } = await parse(GetLogsRequestDTO, { limit: '10001' });

      expect(errors.map((e) => e.property)).toContain('limit');
    });

    it('rejects a malformed address filter', async () => {
      const { errors } = await parse(GetLogsRequestDTO, { from: '0x123' });

      expect(errors.map((e) => e.property)).toContain('from');
    });
  });

  describe('TotalRequestDTO', () => {
    it('parses a block range', async () => {
      const { dto, errors } = await parse(TotalRequestDTO, {
        startBlock: '10',
        endBlock: '20',
      });

      expect(errors).toHaveLength(0);
      expect(dto).toMatchObject({ startBlock: 10, endBlock: 20 });
    });

    it('rejects a non-numeric block', async () => {
      const { errors } = await parse(TotalRequestDTO, { startBlock: 'x' });

      expect(errors.map((e) => e.property)).toContain('startBlock');
    });
  });

  describe('TopAccountsRequestDTO', () => {
    it('applies defaults when the query is empty', async () => {
      const { dto, errors } = await parse(TopAccountsRequestDTO, {});

      expect(errors).toHaveLength(0);
      expect(dto).toMatchObject({
        limit: 10,
        offset: 0,
        order: OrderDirectionEnum.DESC,
        orderBy: OrderByEnum.value,
      });
    });

    it('rejects an unknown orderBy', async () => {
      const { errors } = await parse(TopAccountsRequestDTO, {
        orderBy: 'karma',
      });

      expect(errors.map((e) => e.property)).toContain('orderBy');
    });
  });
});
