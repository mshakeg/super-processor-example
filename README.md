# Aptos Super Indexer Example

Instead of having a separate indexer/coprocessor for each dApp(move package/module) a developer publishes over time it would be more efficient for developer to have a super indexer where they can implement and add on new coprocessors for indexing events for a new move dApp. This way only a single stream is used to service all coprocessors instead of duplicating essentially the same tx stream to service each dApp's indexer/coprocessor.

This super indexer example demonstrates how the above can be achieved. It works as follows:

1. implement a custom `ICoprocessor` similar `CoinFlipProcessor` in `./src/models/coin-flip.ts`; this entails implementing the models, event handlers, etc for this coprocessor.
2. add this newly implemented `ICoprocessor` to the list of `IProcessorManager.coprocessors` in `./src/processors/manager.ts`; NOTE: this also provides a way for developers to simply disable an `ICoprocessor` by removing it from the array of coprocessors `IProcessorManager.coprocessors = [new CoinFlipProcessor()];`
3. For the newly implemented `ICoprocessor` be sure to correctly specify the correct `genesisVersion` for the dApp which normally would be the version at which the first relevant event(for this coprocessor) was emitted; for safety the earliest version the package/module/s containing the events was published at can be used.

The above is basically all that's required by the developer. The `ProcessorManager` will then sync a `ICoprocessor` up to the version that the `SuperProcessor` is synced if it hasn't already, and once all are synced it will then use the `SuperProcessor` stream to service all coprocessors in lock step.

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
```

You may have to start up the postgres db, to do so you can use the `pg:start` script(alternatively use the `docker-compose.yml` to start up postgres and hasura). NOTE: you may have to make the `setup-database.sh` executable, to do so run:

```shell
chmod +x ./scripts/setup-database.sh
```

## Explanation

This example provides a basic processor that extracts events from user transactions and logs them.

When creating a custom processor, the two main things you need to define are:

- Processor: How you process the data from the transactions.
- Models: How you store the data you extract from the transactions.

These are defined in `processor.ts` and `models.ts` respectively.

The SDK handles the rest:

- Connecting to the Transaction Stream Service.
- Creating tables in the database.
- Validating the chain ID.
- Keeping track of the last processed transaction.
- Storing the data from your `processTransactions` function in the database.

In `processor.ts`, we have implemented a `processTransactions` function which accepts a `Transaction[]` as a parameter. The example code shows how to implement custom filtering and how to extract `Events` from a `Transaction`. The function returns a list of event objects that the SDK will add to the database for us.
