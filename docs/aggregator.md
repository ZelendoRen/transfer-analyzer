# Aggregator

`AggregatorService` keeps the database in sync with the chain (two cron jobs) and serves the stored data. The REST endpoints are in `AggregatorController`, see [api.md](api.md).

| Method              | Schedule | Purpose                                         |
| ------------------- | -------- | ----------------------------------------------- |
| `collectData`       | every 5s | Reads new transfers from the chain into the DB. |
| `collectTimestamps` | every 1s | Fills in the date of stored blocks.             |

Each job has an in-memory lock, so a slow run is not overlapped by the next tick. The lock is released even if the run fails.

## collectData()

The position is `nextBlock`, the next block to request. At startup it comes from the database (highest stored block, but at least `START_BLOCK`), afterwards it is kept in memory.

1. Read the chain head.
2. `handleReorg(head)`.
3. `safeHead = head - CONFIRMATIONS`. If `nextBlock > safeHead`, nothing is confirmed yet and the run ends.
4. `getLogsData` requests `Transfer` logs for `[nextBlock, min(nextBlock + BATCH_SIZE - 1, safeHead)]`.
5. Insert the blocks (without a date) and the transfers, both with `ON CONFLICT DO NOTHING`, so re-reading a range is harmless.
6. Set `nextBlock = endBlock + 1`. If any step throws, the position stays and the range is retried on the next tick.

## handleReorg(head)

1. Load up to 100 newest stored blocks with the hash saved at indexing time.
2. If the newest one is more than `REORG_WINDOW` behind the head, treat it as final and stop (no RPC calls while catching up).
3. Compare each stored hash with the node's, newest first, until one matches. The oldest block that did not match is the fork block. A block the node does not know counts as not matching.
4. Delete transfers, then blocks, from the fork block upwards (transfers first because of the foreign key) and set `nextBlock` to the fork block.

## getLogsData(batchSize, safeHead?)

Requests and decodes the logs of one range and returns `{ logs, endBlock }`. Without `safeHead` it is computed from the current head. If the node rejects the range as too large (RPC codes `-32000`, `-32005`, `-32602`), it waits 10 seconds and retries with half the batch, down to one block. Any other error, or a rejected single block, is thrown as `Errors.GetLogs`.

## formatLogs(logs)

Decodes raw logs into `FormattedLogType` (`blockNumber`, `blockHash`, `logIndex`, `transactionHash`, `from`, `to`, `value`). The block hash is what the reorg check relies on. A log that is not a `Transfer` throws `Errors.FormattingLogError` instead of being stored half empty.

## collectTimestamps()

`eth_getLogs` does not return block time, and asking for it per transfer would multiply RPC calls. All transfers of a block share one timestamp, so it is stored once in `blocks_entity`. Each run takes one block without a date, fetches its timestamp and saves it. Errors are logged and the block is retried on the next tick.

## Read methods

`getLogs`, `getTotal` and `getTopAccounts` pass a `RequestLogType` to `TransactionsService` and turn any failure into `Errors.DataBase`.

| Field                           | Description                                         |
| ------------------------------- | --------------------------------------------------- |
| `startBlock`, `endBlock`        | Inclusive block range.                              |
| `startDate`, `endDate`          | Inclusive range of block dates, ISO 8601.           |
| `filter.from`, `filter.to`      | Address filters, case-insensitive.                  |
| `filter.limit`, `filter.offset` | Paging.                                             |
| `filter.order`                  | `ASC` or `DESC`.                                    |
| `filter.orderBy`                | `totalValue`, the only column for `getTopAccounts`. |

## Configuration

`BATCH_SIZE` (2000), `CONFIRMATIONS` (12) and `REORG_WINDOW` (256), see the README.
