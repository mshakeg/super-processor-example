# Aptos Super Indexer Example

Instead of having a separate indexer/coprocessor for each dApp(move package/module) a developer publishes over time it would be more efficient for developer to have a super indexer where they can implement and add on new coprocessors for indexing events for a new move dApp. This way only a single stream is used to service all coprocessors instead of duplicating essentially the same tx stream to service each dApp's indexer/coprocessor.

This super indexer example demonstrates how the above can be achieved. It works as follows:

1. implement a custom `ICoprocessor` similar `CoinFlipProcessor` in `./src/models/coin-flip.ts`; this entails implementing the models, event handlers, etc for this coprocessor.
2. add this newly implemented `ICoprocessor` to the list of `IProcessorManager.coprocessors` in `./src/processors/manager.ts`; NOTE: this also provides a way for developers to simply disable an `ICoprocessor` by removing it from the array of coprocessors `IProcessorManager.coprocessors = [new CoinFlipProcessor()];`
3. For the newly implemented `ICoprocessor` be sure to correctly specify the correct `genesisVersion` for the dApp which normally would be the version at which the first relevant event(for this coprocessor) was emitted; for safety the earliest version the package/module/s containing the events was published at can be used.

The above is basically all that's required by the developer. The `ProcessorManager` will then sync a `ICoprocessor` up to the version that the `SuperProcessor` is synced if it hasn't already, and once all are synced it will then use the `SuperProcessor` stream to service all coprocessors in lock step.

NOTE: developers can create a custom coprocessor that extends the `GenericProcessor`(which in turn extends the `ICoprocessor`) for a more subgraph like developer experience where developers simply have to specify the specific module events they want to handle, and then simply implement handler functions for those specified module events. See the `GenericCoinFlipProcessor` in `./src/processors/coprocessors/generic-coin-flip.ts` for an example of this. `GenericCoinFlipProcessor` is equivalent to `CoinFlipProcessor` regarding the data that is effectively indexed and aggregated.

NOTE: Developers can create custom coprocessors by extending either `GenericProcessor` or `GenericProcessorUoW`, both of which extend `ICoprocessor`. Both provide a similar subgraph-like developer experience, allowing developers to specify the module events they want to handle and implement handler functions for those events. See `GenericCoinFlipProcessorUoW` in `./src/processors/coprocessors/generic-coin-flip-uow.ts` for an example.

PERFORMANCE CONSIDERATIONS:

1. `GenericProcessorUoW` (Recommended generally but especially for High Throughput):
   - Utilizes MikroORM with the Unit of Work pattern.
   - Batches database operations across all events in a transaction batch.
   - Significantly reduces database round-trips, improving performance for high-throughput scenarios.
   - Provides better memory management and transaction handling.

2. `GenericProcessor`:
   - Uses TypeORM for database operations.
   - Simpler to set up but may have lower performance for high-volume data processing.
   - Suitable for lower-throughput scenarios or rapid prototyping.

3. Direct `ICoprocessor` Extension:
   - For advanced use cases requiring custom optimizations.
   - Allows for manual implementation of batching and efficient database I/O.
   - Recommended when `GenericProcessorUoW` doesn't meet specific performance requirements.

Choose the appropriate base class based on your performance needs and familiarity with the ORMs. For most high-performance use cases, `GenericProcessorUoW` is recommended. If you need further optimizations, consider extending `ICoprocessor` directly and implementing custom batching logic.

## Prerequisites

- `pnpm`: The code is tested with pnpm 8.6.2. Later versions should work too.
- `node`: The code is tested with Node 18. Later versions should work too.

## Usage

Install all the dependencies:

```shell
pnpm install
```

Prepare the `config.yaml` file. Make sure to update the `config.yaml` file with the correct indexer setting and database credentials.

```shell
cp config.yaml.example ~/config.yaml

# and for .env
cp .env.example ~/.env
```

Run the example:

```shell
pnpm start process --config ./config.yaml

# alternatively run with .env config
pnpm start process
```

You may have to start up the postgres db, to do so you can use the `pg:start` script(alternatively use the `docker-compose.yml` to start up postgres and hasura). NOTE: you may have to make the `setup-database.sh` executable, to do so run:

```shell
chmod +x ./scripts/setup-database.sh
```
