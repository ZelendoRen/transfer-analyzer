# Aggregator

The aggregator keeps the database in sync with the chain and exposes the stored data. It consists of `AggregatorService` (two cron jobs plus read methods), `AggregatorController` (REST endpoints, see [api.md](api.md)) and the request/response DTOs.

## Cron jobs

| Method              | Schedule                    | Purpose                                               |
| ------------------- | --------------------------- | ----------------------------------------------------- |
| `collectData`       | every 5 s (`*/5 * * * * *`) | Reads new transfers from the chain into the database. |
| `collectTimestamps` | every 1 s (`*/1 * * * * *`) | Fills in the execution date of stored blocks.         |

Each job has an in-memory lock, so a slow iteration is never overlapped by the next tick. The lock is always released, even when the iteration fails.

## `collectData()`

Position is kept in `nextBlock` – the next block that has to be requested. On the first run it is read from the database (`getHighestProcessedBlock`: the highest stored block, but at least `START_BLOCK`); afterwards it lives in memory.

One iteration:

1. Read the chain head.
2. `handleReorg(head)` – detect and undo a reorg (see below).
3. Compute `safeHead = head - CONFIRMATIONS`. If `nextBlock > safeHead` there is nothing confirmed to index yet, and the iteration ends.
4. `getLogsData(BATCH_SIZE, safeHead)` – request `Transfer` logs for `[nextBlock, min(nextBlock + BATCH_SIZE - 1, safeHead)]`.
5. Insert the touched blocks (without a date) and the transfers. Both inserts use `ON CONFLICT DO NOTHING`, so re-reading a range is harmless.
6. Move `nextBlock` to `endBlock + 1`. If anything above throws, the position is **not** moved and the same range is retried on the next tick.

## `handleReorg(head)`

See the README section on [confirmations and reorg handling](../README.md#confirmations-and-reorg-handling) for the idea. Mechanics:

1. Load up to 100 of the newest stored blocks with the hash saved at indexing time (`getLatestIndexedBlocks`).
2. If the newest one is further than `REORG_WINDOW` blocks behind the head, it is treated as final and nothing is checked (no RPC calls while catching up on history).
3. Compare stored and canonical hash (`getBlockHash`), newest first, until one matches. Every block that did not match is stale; the oldest of them is the fork block.
4. Delete transfers, then blocks, from the fork block upwards (transfers first because of the foreign key) and set `nextBlock` to the fork block.

A block the node does not know (`undefined` hash) counts as reorged.

## `getLogsData(iterationBatchSize, safeHead?)`

Requests and formats the logs of one range and returns `{ logs, endBlock }`. If `safeHead` is omitted it is computed from the current head and `CONFIRMATIONS`.

When the node rejects the range as too large (RPC error codes `-32000`, `-32005`, `-32602`), the method waits 10 seconds and retries with half the batch size, down to a single block. Any other error – or a rejected single block – is thrown as `Errors.GetLogs`.

## `formatLogs(logs)`

Decodes raw logs with the contract ABI into `FormattedLogType` (`blockNumber`, `blockHash`, `logIndex`, `transactionHash`, `from`, `to`, `value`). The block hash is what makes reorg detection possible. A log that cannot be decoded as a `Transfer` is an error (`Errors.FormattingLogError`) rather than being stored with empty fields.

## `collectTimestamps()`

`eth_getLogs` does not return the time of a block, and asking for it per transfer would multiply the RPC load. All transfers of a block share one timestamp, so it is stored once, in the `blocks_entity` table:

1. Take one block that has no `executedDate`.
2. Fetch the block and read its timestamp.
3. Store the date.

One block per second keeps the request rate low and works within public RPC limits. Errors are logged and the block is retried on the next tick.

## Read methods

`getLogs(args)`, `getTotal(args)` and `getTopAccounts(args)` delegate to `TransactionsService` and map any storage failure to `Errors.DataBase`. `args` is a `RequestLogType`:

| Field                           | Type            | Description                                         |
| ------------------------------- | --------------- | --------------------------------------------------- |
| `startBlock`, `endBlock`        | number          | Inclusive block range.                              |
| `startDate`, `endDate`          | string          | Inclusive range of block execution dates, ISO 8601. |
| `filter.from`, `filter.to`      | string          | Address filters (case-insensitive).                 |
| `filter.limit`, `filter.offset` | number          | Paging.                                             |
| `filter.order`                  | `ASC` \| `DESC` | Sort direction.                                     |
| `filter.orderBy`                | `totalValue`    | Sort column for `getTopAccounts`.                   |

## Configuration

| Variable        | Default | Used for                                                    |
| --------------- | ------- | ----------------------------------------------------------- |
| `BATCH_SIZE`    | 2000    | Max blocks per `eth_getLogs` request.                       |
| `CONFIRMATIONS` | 12      | Confirmation depth before a block is indexed.               |
| `REORG_WINDOW`  | 256     | Distance from the head within which blocks are re-verified. |

## Dependencies

- `BlockchainService` – RPC access (logs, head, block hash and timestamp).
- `TransactionsService` – persistence of transfers, reorg lookups and queries.
- `BlocksService` – persistence of blocks and their timestamps.
- `ConfigService` – the settings above.
