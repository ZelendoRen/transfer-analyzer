# Repository

The repository module is the data access layer. `BlocksService` and `TransactionsService` wrap TypeORM query builders for `BlocksEntity` and `TransactionsEntity`; the module registers both entities with `TypeOrmModule.forFeature` and exports the two services. Every method logs the underlying error and rethrows `Error(Errors.DataBase)`.

## `BlocksService`

| Method                    | Description                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `addBlocks(blocks)`       | Inserts blocks (`blockNumber`, optional `executedDate`) with `ON CONFLICT DO NOTHING`.                                   |
| `setExecutionDate(block)` | Sets `executedDate` of one block.                                                                                        |
| `getBlockWithoutDate()`   | Returns one block number that has no date yet, or `undefined`. The value is converted from PostgreSQL's string `bigint`. |
| `deleteFromBlock(n)`      | Deletes every block with `blockNumber >= n`. Used by the reorg rollback.                                                 |

## `TransactionsService`

### Writing

| Method                  | Description                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setTransactions(logs)` | Inserts `FormattedLogType[]` in chunks of 1000 rows with `ON CONFLICT DO NOTHING`. Returns `false` for an empty list.                                   |
| `deleteFromBlock(n)`    | Deletes every transfer with `blockNumber >= n`. Used by the reorg rollback; must run before `BlocksService.deleteFromBlock` because of the foreign key. |

### Sync state

| Method                          | Description                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `getHighestProcessedBlock()`    | `max(highest stored block, START_BLOCK)` – where the indexer resumes after a restart.                                             |
| `getLatestIndexedBlocks(limit)` | The newest distinct `{ blockNumber, blockHash }` pairs, newest first. Rows without a hash are skipped. Input for reorg detection. |

### Queries

All three accept a `RequestLogType` (block range **or** date range, address filters, paging, ordering – see [aggregator.md](aggregator.md)). Date filters apply to `blocks.executedDate`, so transfers whose block has no date yet are not matched by a date range.

- **`getLogs(args)`** returns the matching transfers joined with their block date, ordered by block number.
- **`getTotal(args)`** returns the aggregates of the matching transfers: count, sum, min and max value, first and last block and date (`TotalParamsResponseType`; numeric values are strings).
- **`getTopAccounts(args)`** groups by sender and returns `address`, `totalvalue` and `numberoftransactions`, ordered by `totalValue` and supporting `limit` and `offset` (`TopAccountsResponseType`).

Column aliases in raw results are lower-case because PostgreSQL folds unquoted aliases; the controllers map them to the camel-case response DTOs.
