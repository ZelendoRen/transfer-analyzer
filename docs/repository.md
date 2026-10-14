# Repository

Data access over TypeORM query builders. `BlocksService` and `TransactionsService` are exported by `RepositoryModule`. Every method logs the underlying error and throws `Errors.DataBase`.

## BlocksService

| Method                    | Description                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `addBlocks(blocks)`       | Inserts blocks with `ON CONFLICT DO NOTHING`.                                                  |
| `setExecutionDate(block)` | Sets the date of one block.                                                                    |
| `getBlockWithoutDate()`   | One block number without a date, or `undefined` (converted from PostgreSQL's `bigint` string). |
| `deleteFromBlock(n)`      | Deletes blocks with `blockNumber >= n`, used by the reorg rollback.                            |

## TransactionsService

| Method                          | Description                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `setTransactions(logs)`         | Inserts in chunks of 1000 rows with `ON CONFLICT DO NOTHING`. Returns `false` for an empty list.                          |
| `deleteFromBlock(n)`            | Deletes transfers with `blockNumber >= n`. Run it before `BlocksService.deleteFromBlock` because of the foreign key.      |
| `getHighestProcessedBlock()`    | `max(highest stored block, START_BLOCK)`, where the indexer resumes.                                                      |
| `getLatestIndexedBlocks(limit)` | Newest distinct `{ blockNumber, blockHash }` pairs, newest first, rows without a hash skipped. Input for the reorg check. |
| `getLogs(args)`                 | Matching transfers joined with the block date, ordered by block number.                                                   |
| `getTotal(args)`                | Count, sum, min and max value, first and last block and date. Numeric values are strings.                                 |
| `getTopAccounts(args)`          | Groups by sender: `address`, `totalvalue`, `numberoftransactions`, ordered by `totalValue`, with `limit` and `offset`.    |

The queries take a `RequestLogType` (see [aggregator.md](aggregator.md)). Date filters apply to `blocks.executedDate`, so transfers whose block has no date yet do not match a date range. Aliases in raw results are lower-case because PostgreSQL folds unquoted aliases; the controllers map them to camel-case DTOs.
