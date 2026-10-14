# Database

`DatabaseModule` configures the TypeORM connection to PostgreSQL and registers the entities. It is `@Global()` and exports `TypeOrmModule`, so repositories can be injected anywhere without importing it again.

## Connection

Configured with `TypeOrmModule.forRootAsync` from environment variables:

| Variable                                                  | Description                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Connection settings.                                                                                          |
| `DB_SYNCHRONIZE`                                          | `true` (default) lets TypeORM create and alter tables on start; set to `false` to manage the schema yourself. |

`synchronize` is convenient for development and a first deployment. For anything that has to evolve safely, switch to migrations.

## Entities

### `BlocksEntity` (`blocks_entity`)

One row per block that contains at least one indexed transfer.

| Column         | Type        | Description                                              |
| -------------- | ----------- | -------------------------------------------------------- |
| `blockNumber`  | `bigint`    | Primary key.                                             |
| `uploaded`     | `timestamp` | When the row was created.                                |
| `executedDate` | `timestamp` | Block time. `NULL` until the background job fills it in. |
| `transactions` | relation    | One-to-many to `TransactionsEntity`.                     |

### `TransactionsEntity` (`transactions_entity`)

One row per `Transfer` event.

| Column            | Type          | Description                                                                          |
| ----------------- | ------------- | ------------------------------------------------------------------------------------ |
| `transactionHash` | `varchar(66)` | Primary key, part 1.                                                                 |
| `logIndex`        | `integer`     | Primary key, part 2. Position of the log in the block.                               |
| `blockNumber`     | `bigint`      | Block of the transfer, foreign key to `blocks_entity`. Indexed.                      |
| `blockHash`       | `varchar(66)` | Hash of the block when it was indexed; used to detect reorgs. `NULL` for older rows. |
| `from`            | `varchar(42)` | Sender. Indexed.                                                                     |
| `to`              | `varchar(42)` | Receiver. Indexed.                                                                   |
| `value`           | `numeric`     | Amount in the token's base units. Indexed.                                           |
| `uploaded`        | `timestamp`   | When the row was created.                                                            |
| `blocks`          | relation      | Many-to-one to `BlocksEntity`.                                                       |

The primary key `(transactionHash, logIndex)` makes inserts idempotent: re-reading a block range never creates duplicates.

## Notes

- `bigint` and `numeric` columns come back from PostgreSQL as strings; the services convert block numbers to numbers where needed. Amounts stay strings, as they can exceed `Number.MAX_SAFE_INTEGER`.
- Rows are deleted only by the reorg rollback, transfers first and blocks second.
