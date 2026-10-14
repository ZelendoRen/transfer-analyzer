# Transfer Analyzer

[![CI](https://github.com/ZelendoRen/transfer-analyzer/actions/workflows/ci.yml/badge.svg)](https://github.com/ZelendoRen/transfer-analyzer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Indexer for ERC-20 `Transfer` events. It reads logs from any EVM JSON-RPC node, stores them in PostgreSQL and serves transfers, totals and top accounts over a REST API. Only confirmed blocks are indexed, and blocks dropped by a chain reorganisation are rolled back.

The defaults index native USDC on Avalanche C-Chain; contract, node and start block are plain config.

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/) [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336B91?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/) [![TypeORM](https://img.shields.io/badge/TypeORM-DD4B39?style=for-the-badge&logo=typeorm&logoColor=white)](https://typeorm.io/) [![Ethers.js](https://img.shields.io/badge/Ethers.js-2C3E50?style=for-the-badge&logo=ethers.js&logoColor=white)](https://docs.ethers.org/v6/) [![Swagger](https://img.shields.io/badge/Swagger-85EA2D?style=for-the-badge&logo=swagger&logoColor=000)](https://swagger.io/) [![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)

## How it works

```
                 every 5 s                                every 1 s
        +----------------------+                 +----------------------+
RPC --->| collectData()        |                 | collectTimestamps()  |<--- RPC
node    |  1. reorg check      |                 |  block without date  |     node
        |  2. head - N confs   |                 |  -> block timestamp  |
        |  3. eth_getLogs      |                 +-----------+----------+
        +-----------+----------+                             |
                    |                                        |
                    v                                        v
        +------------------------------ PostgreSQL ------------------------+
        |  transactions_entity (hash, logIndex, block, from, to, ...)       |
        |  blocks_entity       (blockNumber, executedDate)                  |
        +---------------------------------+---------------------------------+
                                          |
                                          v
                              REST API  /api/v1/aggregator/*
```

The sync resumes from the database after a restart. If the node rejects a block range as too large, the batch is halved and retried. Block timestamps are fetched separately, one block per second, so date filters work without an RPC call per request. Module details are in [docs/](docs).

## Quick start

Needs Node.js 20+, Yarn 1.x and PostgreSQL (or Docker).

```bash
git clone https://github.com/ZelendoRen/transfer-analyzer.git
cd transfer-analyzer

yarn install
cp .env.example .env        # defaults work for USDC on Avalanche
docker compose up -d        # PostgreSQL matching .env.example
yarn start:dev
```

The tables are created on start and syncing begins at `START_BLOCK`. The API answers right away with whatever is indexed so far.

- API: <http://localhost:3000/api/v1/aggregator/total>
- Swagger UI: <http://localhost:3000/docs>

Production: `yarn build && yarn start:prod`.

## Configuration

Environment variables, see [.env.example](.env.example).

| Variable                                                  | Default  | Description                                                                                                        |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `CONTRACT_ADDRESS`                                        | required | ERC-20 contract. The example is native USDC on Avalanche, `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E`.            |
| `RPC_URL`                                                 | required | JSON-RPC endpoint. Public nodes usually limit the block range and request rate.                                    |
| `START_BLOCK`                                             | `0`      | First block to index, ideally the deployment block (`7388829` for the USDC example). Earlier transfers are missed. |
| `BATCH_SIZE`                                              | `2000`   | Max blocks per `eth_getLogs` request.                                                                              |
| `CONFIRMATIONS`                                           | `12`     | Blocks that must sit on top of a block before it is indexed. `0` indexes the head.                                 |
| `REORG_WINDOW`                                            | `256`    | Stored blocks within this distance of the head are re-checked for reorgs.                                          |
| `PORT`                                                    | `3000`   | HTTP port.                                                                                                         |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |          | PostgreSQL connection.                                                                                             |
| `DB_SYNCHRONIZE`                                          | `true`   | Let TypeORM create and alter tables on start. Set `false` if you manage the schema yourself.                       |

## API

Base path `/api/v1`, full parameters and examples in Swagger at `/docs` and in [docs/api.md](docs/api.md).

| Endpoint                       | Source     | Description                                                               |
| ------------------------------ | ---------- | ------------------------------------------------------------------------- |
| `GET /aggregator/logs`         | database   | Transfers, filtered by `from`/`to`, block or date range, with paging.     |
| `GET /aggregator/total`        | database   | Count, sum, min and max value, first and last block and date of a period. |
| `GET /aggregator/top-accounts` | database   | Senders ranked by transferred value.                                      |
| `GET /analyzer/logs`           | blockchain | Transfers read straight from the node, without touching the database.     |

Block ranges are `startBlock`/`endBlock`, date ranges are `startDate`/`endDate` in milliseconds; the two cannot be combined. Amounts are in base units (USDC has 6 decimals, so `1000000` is 1 USDC).

```bash
# 5 largest senders in a block range
curl "http://localhost:3000/api/v1/aggregator/top-accounts?startBlock=7388829&endBlock=8000000&limit=5"

# transfers sent by an address, newest first
curl "http://localhost:3000/api/v1/aggregator/logs?from=0x625E7708f30cA75bfd92586e17077590C60eb4cD&limit=10&order=desc"

# statistics for one day
curl "http://localhost:3000/api/v1/aggregator/total?startDate=1620000000000&endDate=1620086400000"
```

## Confirmations and reorgs

The chain head is not final: a node can replace the latest blocks with another branch, and transfers from the dropped branch must not stay in the database.

1. **Confirmations.** Logs are requested only up to `head - CONFIRMATIONS`, so fresh blocks are not indexed at all.
2. **Reorg check.** Each stored transfer keeps its block hash. When the newest stored block is within `REORG_WINDOW` of the head, its hash is compared with the node's. Hashes are chained, so if that block still matches, every older one does too. On a mismatch the indexer walks back to the fork point, deletes everything from there and indexes the correct branch again.

Once synced this costs one `eth_getBlockByNumber` call per iteration, and nothing while catching up on history. Rows indexed before the `blockHash` column existed are skipped by the check.

## Testing

```bash
yarn test        # unit tests, no network or database needed
yarn test:cov    # with coverage
yarn lint
```

Unit tests mock the RPC node and the database. They cover the sync loop, confirmation depth, reorg rollback, batch shrinking, topic filter encoding, the repositories, controllers and request validation.

## Limitations

- A first sync of a busy token on a public RPC can take hours; use your own node for a faster backfill.
- Tables are created by TypeORM `synchronize`; there are no migrations yet.
- One contract per instance.
- `top-accounts` ranks senders only, not receivers.
- No authentication or rate limiting on the API.

## License

[MIT](LICENSE)
