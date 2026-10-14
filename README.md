# Transfer Analyzer

[![CI](https://github.com/ZelendoRen/transfer-analyzer/actions/workflows/ci.yml/badge.svg)](https://github.com/ZelendoRen/transfer-analyzer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An ERC-20 `Transfer` event indexer for EVM chains. It reads logs from any JSON-RPC node, stores them in PostgreSQL and serves aggregated data (transfers, totals, top accounts) over a REST API. Only confirmed blocks are indexed, and blocks that are reorganised away are detected and rolled back automatically.

By default it indexes **native USDC on Avalanche C-Chain**, but the contract, chain and start block are plain configuration.

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/) [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336B91?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/) [![TypeORM](https://img.shields.io/badge/TypeORM-DD4B39?style=for-the-badge&logo=typeorm&logoColor=white)](https://typeorm.io/) [![Ethers.js](https://img.shields.io/badge/Ethers.js-2C3E50?style=for-the-badge&logo=ethers.js&logoColor=white)](https://docs.ethers.org/v6/) [![Swagger](https://img.shields.io/badge/Swagger-85EA2D?style=for-the-badge&logo=swagger&logoColor=000)](https://swagger.io/) [![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)

## Contents

1. [Features](#features)
2. [How it works](#how-it-works)
3. [Quick start](#quick-start)
4. [Configuration](#configuration)
5. [API](#api)
6. [Confirmations and reorg handling](#confirmations-and-reorg-handling)
7. [Testing](#testing)
8. [Project structure](#project-structure)
9. [Limitations and roadmap](#limitations-and-roadmap)
10. [Module documentation](#module-documentation)

## Features

- **Resumable sync.** Walks the chain in `eth_getLogs` batches, remembers its position in the database and continues from there after a restart.
- **Confirmations.** A block is indexed only after `CONFIRMATIONS` blocks were built on top of it.
- **Reorg detection and rollback.** The block hash is stored with every transfer. If the canonical hash changes, everything from the fork point is deleted and re-indexed.
- **Adaptive batching.** If the RPC rejects a range as too large, the batch is halved and retried.
- **Block timestamps** are collected in the background, so the API can filter by date without an extra RPC call per request.
- **REST API** with filtering, pagination and generated Swagger docs.
- **Direct chain access** (`/analyzer/logs`) for ad-hoc queries that bypass the database.
- **Tested.** Unit tests cover the sync loop, reorg handling, the RPC wrapper, the repositories, the controllers and the DTO validation.

## How it works

```
                      every 5 s                                every 1 s
              ┌─────────────────────┐                  ┌─────────────────────┐
 RPC node ───►│ collectData()       │                  │ collectTimestamps() │◄─── RPC node
              │  1. reorg check     │                  │  block without date │
              │  2. head - N confs  │                  │  -> block timestamp │
              │  3. eth_getLogs     │                  └──────────┬──────────┘
              └──────────┬──────────┘                             │
                         ▼                                        ▼
                ┌────────────────────────────  PostgreSQL  ─────────────────┐
                │  transactions_entity (hash, logIndex, block, from, to, …)  │
                │  blocks_entity       (blockNumber, executedDate)           │
                └───────────────────────────────┬────────────────────────────┘
                                                ▼
                                    REST API  /api/v1/aggregator/*
```

The two cron jobs are independent and never overlap with themselves. Details of every module are in [docs/](docs).

## Quick start

Requirements: Node.js 20+, Yarn 1.x and PostgreSQL 14+ (or Docker).

```bash
git clone https://github.com/ZelendoRen/transfer-analyzer.git
cd transfer-analyzer

yarn install
cp .env.example .env        # defaults work for USDC on Avalanche

docker compose up -d        # PostgreSQL matching the defaults in .env.example
yarn start:dev
```

On start the service creates the tables and begins syncing from `START_BLOCK`. A full sync of a busy token takes a while on a public RPC (see [Limitations](#limitations-and-roadmap)); the API is available immediately and returns what has been indexed so far.

- API: <http://localhost:3000/api/v1/aggregator/total>
- Swagger UI: <http://localhost:3000/docs>

Production build: `yarn build && yarn start:prod`.

## Configuration

All settings are environment variables (see [.env.example](.env.example)).

| Variable                                                  | Default      | Description                                                                                                                             |
| --------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTRACT_ADDRESS`                                        | – (required) | ERC-20 contract to index. The example uses native USDC on Avalanche: `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E`.                      |
| `RPC_URL`                                                 | – (required) | JSON-RPC endpoint of the chain. Any node works; public ones usually limit the block range and requests per minute.                      |
| `START_BLOCK`                                             | `0`          | First block to index, ideally the deployment block of the contract (`7388829` for the USDC example). Earlier transfers are not indexed. |
| `BATCH_SIZE`                                              | `2000`       | Max blocks per `eth_getLogs` request. Reduced automatically when the node refuses a range.                                              |
| `CONFIRMATIONS`                                           | `12`         | Blocks that must be built on top of a block before it is indexed. `0` indexes the chain head.                                           |
| `REORG_WINDOW`                                            | `256`        | Indexed blocks within this distance from the head are re-verified on every iteration; older ones are considered final.                  |
| `PORT`                                                    | `3000`       | HTTP port.                                                                                                                              |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | –            | PostgreSQL connection.                                                                                                                  |
| `DB_SYNCHRONIZE`                                          | `true`       | Let TypeORM create and alter tables on start. Set to `false` once you manage the schema yourself.                                       |

## API

Base path: `/api/v1`. Interactive documentation with all parameters and example responses: `/docs`.

| Endpoint                       | Source     | Description                                                                 |
| ------------------------------ | ---------- | --------------------------------------------------------------------------- |
| `GET /aggregator/logs`         | database   | Indexed transfers with filters (`from`, `to`), block or date range, paging. |
| `GET /aggregator/total`        | database   | Count, total, min and max value, first and last block/date of a period.     |
| `GET /aggregator/top-accounts` | database   | Senders ranked by transferred value.                                        |
| `GET /analyzer/logs`           | blockchain | Transfers read straight from the node, without touching the database.       |

Block ranges are `startBlock`/`endBlock`, date ranges are `startDate`/`endDate` as **millisecond timestamps**. A block range and a date range cannot be combined. Amounts are returned in the token's base units (USDC has 6 decimals, so `1000000` is 1 USDC).

```bash
# the 5 largest senders in a block range
curl "http://localhost:3000/api/v1/aggregator/top-accounts?startBlock=7388829&endBlock=8000000&limit=5"

# transfers sent by an address, newest first
curl "http://localhost:3000/api/v1/aggregator/logs?from=0x625E7708f30cA75bfd92586e17077590C60eb4cD&limit=10&order=desc"

# overall statistics for one day
curl "http://localhost:3000/api/v1/aggregator/total?startDate=1620000000000&endDate=1620086400000"
```

## Confirmations and reorg handling

A chain head is not final: the node may replace the latest blocks with a different branch (a _reorg_), and transfers from the abandoned branch must not stay in the database. The indexer protects against this in two layers.

1. **Confirmations.** Logs are requested only up to `head - CONFIRMATIONS`, so recent, still unstable blocks are not indexed at all.
2. **Reorg detection.** Every stored transfer keeps the hash of its block. When the newest stored block is close to the head (`REORG_WINDOW`), its hash is compared with the one the node reports now. Hashes are chained, so if the newest block still matches, every older one does too. On a mismatch the indexer walks back through the stored blocks to find the fork point, deletes all transfers and blocks from there and rewinds its position, so the correct branch is indexed on the next iteration.

The check costs one `eth_getBlockByNumber` call per iteration once the indexer has caught up, and nothing while it is still catching up on history. Rows written before the `blockHash` column existed are ignored by the check.

## Testing

```bash
yarn test            # unit tests
yarn test:cov        # with coverage
yarn lint            # eslint + prettier
```

The tests mock the RPC node and the database, so they need neither network access nor PostgreSQL. They cover, among other things: confirmation depth, cursor handling between iterations, reorg rollback (including walking back to the fork point and deletion order), batch shrinking on RPC errors, topic filter encoding, and request validation.

## Project structure

```
src/
├── aggregator/   cron jobs (sync) + REST endpoints over the stored data
├── analyzer/     REST endpoint that reads logs directly from the chain
├── blockchain/   ethers.js wrapper: provider, logs, block hashes, topics, ERC-20 ABI
├── repository/   TypeORM data access for blocks and transactions
├── database/     connection setup and entities
├── common/       shared DTO transforms
├── enum/  types/ shared enums and types
└── main.ts       bootstrap, validation, Swagger
```

## Limitations and roadmap

- **Public RPC speed.** Public endpoints cap the request rate (and often the block range), so the very first sync of a busy token can take hours. Use your own or a paid node for a faster backfill.
- **Schema management.** Tables are created with TypeORM `synchronize`. Versioned migrations would be the next step for a real deployment.
- **One contract per instance.** To index several tokens, run several instances with separate databases.
- **`top-accounts` ranks senders only** (by `from`), not receivers.
- **No authentication or rate limiting** on the API; put it behind a gateway if it is exposed publicly.

## Module documentation

- [Aggregator](docs/aggregator.md) – sync loop, confirmations, reorg handling
- [Analyzer](docs/analyzer.md) – direct chain queries
- [Blockchain](docs/blockchain.md) – RPC wrapper
- [Database](docs/database.md) – entities and schema
- [Repository](docs/repository.md) – data access layer
- [App](docs/app.md) – bootstrap and configuration
- [API overview](docs/api.md) – endpoints and parameters

## License

[MIT](LICENSE)
