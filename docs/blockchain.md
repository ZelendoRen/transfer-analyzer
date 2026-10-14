# Blockchain

`BlockchainService` is the only place that talks to the node. It wraps an ethers.js `JsonRpcProvider` and an ERC-20 `Contract` built from the ABI in `src/blockchain/abi/ERC20.abi.json`. The module is `@Global()`, so any module can inject the service.

## Construction

The constructor reads `RPC_URL` and `CONTRACT_ADDRESS` from `ConfigService` and fails fast with a clear message if either is missing or if the address is malformed.

## Methods

### `getCurrentBlockNumber(): Promise<number>`

The chain head. Throws `Errors.BlockChain` on RPC failure.

### `getBlockHash(blockNumber): Promise<string | undefined>`

The hash of the block as the node sees it **now**. Compared with the hash stored at indexing time to detect reorgs. Returns `undefined` if the node does not know the block, and throws `Errors.BlockChain` on RPC failure.

### `getBlockMintedTimestamp(blockNumber): Promise<number>`

The block timestamp in seconds. Throws `Errors.BlockChain` if the block does not exist or the RPC call fails.

### `getLogs(args): Promise<ethers.Log[]>`

Wraps `eth_getLogs` for the configured contract.

- **Parameters:** `GetBlockParamsType` – `startBlock`, optional `endBlock` (defaults to the head), `topicName`, optional `filter.from` / `filter.to`.
- **Errors are not wrapped.** The raw RPC error is rethrown, because the [aggregator](aggregator.md) inspects its code to decide whether to shrink the batch.

### `getTopic(topicName, filters): Array<string | null>`

Builds the `topics` array for `eth_getLogs`: the event signature hash followed by the zero-padded indexed arguments.

Topics are positional – slot 1 is `from`, slot 2 is `to`. A filter that is not set stays a `null` placeholder, so a `to`-only filter is encoded as `[signature, null, to]` and is not mistaken for a `from` filter. Trailing `null`s are dropped. An unknown event name throws `Errors.BlockChain`.

### `parseLog(log): TransferArgs | undefined`

Decodes a raw log into `{ from, to, value }` (`value` is a `bigint`). Returns `undefined` if the log does not belong to an event of the ABI, and throws `Errors.BlockChain` on a decoding error.

## Error handling

Failures are logged with the NestJS `Logger` and rethrown as `Error(Errors.BlockChain)`, except for `getLogs` as described above.

## Configuration

| Variable           | Description                      |
| ------------------ | -------------------------------- |
| `RPC_URL`          | JSON-RPC endpoint.               |
| `CONTRACT_ADDRESS` | Address of the indexed contract. |
