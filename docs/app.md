# App

`AppModule` is the root module. `main.ts` bootstraps the HTTP server.

## Modules

- `ConfigModule` - loads `.env` and the process environment.
- `ScheduleModule` - runs the aggregator's cron jobs.
- `DatabaseModule` - PostgreSQL connection and entities ([database.md](database.md)).
- `BlockchainModule` - RPC access ([blockchain.md](blockchain.md)).
- `AggregatorModule` - sync loop and stored-data API ([aggregator.md](aggregator.md)).
- `AnalyzerModule` - direct chain queries ([analyzer.md](analyzer.md)).

`AppController` and `AppService` are empty placeholders, kept for the standard Nest layout.

## Bootstrap (`main.ts`)

1. Create the Nest application.
2. Enable CORS and set the global prefix `api/v1`.
3. Build the OpenAPI document, write it to `swagger-spec.json` (git-ignored, regenerated on every start) and serve Swagger UI at `/docs`. The document is generated without the global prefix, and the prefix is declared as the server URL.
4. Register a global `ValidationPipe`; controllers additionally use `transform: true`, so query strings are converted by the DTOs.
5. Listen on `PORT` (default `3000`).

## Configuration

The application starts only with a valid configuration: `BlockchainService` refuses to start without `RPC_URL` and `CONTRACT_ADDRESS` and with a malformed address. See the table in the [README](../README.md#configuration) for all variables.
