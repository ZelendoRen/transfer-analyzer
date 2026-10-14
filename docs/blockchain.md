# Blockchain

`BlockchainService` is the only place that talks to the node. It wraps an ethers.js `JsonRpcProvider` and an ERC-20 contract built from `src/blockchain/abi/ERC20.abi.json`. The module is `@Global()`.

The constructor reads `RPC_URL` and `CONTRACT_ADDRESS` and fails with a clear message if either is missing or the address is malformed.

| Method                       | Description                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `getCurrentBlockNumber()`    | Chain head.                                                                                                             |
| `getBlockHash(n)`            | Hash of block `n` as the node sees it now, `undefined` if unknown. Compared with the stored hash to detect reorgs.      |
| `getBlockMintedTimestamp(n)` | Block time in seconds. Throws if the block does not exist.                                                              |
| `getLogs(args)`              | `eth_getLogs` for the configured contract. `endBlock` defaults to the head. RPC errors are **not** wrapped (see below). |
| `getTopic(name, filters)`    | Builds the `topics` array: event signature, then the zero-padded `from` and `to`.                                       |
| `parseLog(log)`              | Decodes a raw log into `{ from, to, value }` (`value` is a `bigint`), `undefined` if it is not an event of the ABI.     |

`getLogs` rethrows the raw RPC error because the [aggregator](aggregator.md) reads its code to decide whether to shrink the batch. All other methods log the failure and throw `Errors.BlockChain`.

Topics are positional (slot 1 is `from`, slot 2 is `to`), so an unset filter stays a `null` placeholder: a `to`-only filter becomes `[signature, null, to]` and is not mistaken for a `from` filter. Trailing `null`s are dropped.
