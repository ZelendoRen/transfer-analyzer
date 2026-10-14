# API overview

Base path: `/api/v1`. The same information, with request/response schemas and examples, is served as Swagger UI at `/docs`.

Conventions:

- **Block range:** `startBlock` and `endBlock` (inclusive). Both must be given for the range to apply, and `endBlock` must not be lower than `startBlock`.
- **Date range:** `startDate` and `endDate` as **timestamps in milliseconds**, applied to the block execution date. `endDate` must not be earlier than `startDate`.
- A block range and a date range cannot be combined (`400`).
- Amounts are strings in the token's base units.
- Invalid input answers `400` with the validation message.

## Aggregator - indexed data

### `GET /aggregator/logs`

Transfers from the database.

| Parameter                | Type   | Default | Description                                   |
| ------------------------ | ------ | ------- | --------------------------------------------- |
| `startBlock`, `endBlock` | number | -       | Block range.                                  |
| `startDate`, `endDate`   | number | -       | Date range, milliseconds.                     |
| `from`, `to`             | string | -       | Sender / receiver address (case-insensitive). |
| `limit`                  | number | 23      | 0-10 000.                                     |
| `offset`                 | number | 0       | Rows to skip.                                 |
| `order`                  | string | `DESC`  | `ASC` or `DESC`, by block number. Any case.   |

Response `200`: array of

```json
{
  "transactionHash": "0xaefe6097...509f",
  "blockNumber": 20391007,
  "logIndex": 3,
  "executedDate": "2025-02-20T18:19:41.000Z",
  "uploaded": "2025-02-20T18:19:59.114Z",
  "from": "0x2C88A3B97263D703fD6D2434e14fA3a51f3Ce39c",
  "to": "0xf4003F4efBE8691B60249E6afbD307aBE7758adb",
  "value": "1921"
}
```

`executedDate` is `null` for blocks whose timestamp has not been collected yet.

### `GET /aggregator/total`

Statistics over all indexed transfers, or over the selected period.

Parameters: `startBlock`, `endBlock`, `startDate`, `endDate`.

Response `200`:

```json
{
  "firstTransaction": "2021-09-30T09:15:42.000Z",
  "lastTransaction": "2025-02-20T18:19:59.000Z",
  "firstBlock": 7390439,
  "lastBlock": 21048005,
  "totalTransactionsCount": "5476041",
  "totalValue": "98206728778933391",
  "minTransactionValue": "0",
  "maxTransactionValue": "193056413000000"
}
```

### `GET /aggregator/top-accounts`

Senders ranked by the total value they transferred.

| Parameter                | Type   | Default      | Description               |
| ------------------------ | ------ | ------------ | ------------------------- |
| `startBlock`, `endBlock` | number | -            | Block range.              |
| `startDate`, `endDate`   | number | -            | Date range, milliseconds. |
| `limit`                  | number | 10           | 0-10 000.                 |
| `offset`                 | number | 0            | Rows to skip.             |
| `order`                  | string | `DESC`       | `ASC` or `DESC`.          |
| `orderBy`                | string | `totalValue` | Sort column.              |

Response `200`: array of

```json
{
  "address": "0x625E7708f30cA75bfd92586e17077590C60eb4cD",
  "totalValue": "15609044266552454",
  "totalTransactions": 60059
}
```

## Analyzer - live chain data

### `GET /analyzer/logs`

Transfers read directly from the node. Nothing is read from or written to the database.

| Parameter    | Type   | Required | Description                        |
| ------------ | ------ | -------- | ---------------------------------- |
| `startBlock` | number | yes      | First block.                       |
| `endBlock`   | number | yes      | Last block.                        |
| `from`, `to` | string | no       | Sender / receiver address filters. |
| `topicName`  | string | no       | Event name, `Transfer` (default).  |

Response `200`: array of `{ transactionHash, blockNumber, logIndex, from, to, value }`.

Errors: `400` for a missing or inverted range, `500` if the node fails (for example because the range is too large for it). The size of the range is limited by the node only.

## Errors

| Status | When                                                                       |
| ------ | -------------------------------------------------------------------------- |
| `400`  | Validation failed, conflicting or inverted ranges, or no data for `total`. |
| `500`  | The database or the RPC node failed.                                       |
