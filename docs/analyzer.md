# Analyzer

The analyzer answers ad-hoc questions straight from the blockchain, without reading or writing the database. It is useful to check data that is not indexed yet or to cross-check the indexed data. The endpoint is described in [api.md](api.md).

## `AnalyzerService.getLogs(args)`

Reads `Transfer` logs from the node and decodes them.

- **Parameters:** `GetBlockParamsType`

  | Field                      | Type   | Description                                 |
  | -------------------------- | ------ | ------------------------------------------- |
  | `startBlock`               | string | First block of the range.                   |
  | `endBlock`                 | string | Last block of the range.                    |
  | `topicName`                | string | Event name, `Transfer`.                     |
  | `filter.from`, `filter.to` | string | Optional sender / receiver address filters. |

- **Returns:** `FormattedLogType[]` – `transactionHash`, `blockNumber`, `blockHash`, `logIndex`, `from`, `to`, `value` (a string in the token's base units).
- **Logic:**
  1. Fetch the raw logs with `BlockchainService.getLogs`.
  2. Decode each log with `BlockchainService.parseLog`.
  3. Map it to a `FormattedLogType`.
- **Throws:** `Error(Errors.RPCErrors)` if the node fails or a log cannot be decoded as a `Transfer`. The cause is logged.

The size of the range is limited only by the RPC node: a node that rejects a large range makes the request fail, and the caller should ask for a smaller one. There is no automatic batching here, unlike in the [aggregator](aggregator.md).

## Dependencies

- `BlockchainService` – provides `getLogs` and `parseLog`.
