import { Base, Config, Worker } from "@aptos-labs/aptos-processor-sdk";
import { DataSource } from "typeorm";
import { blueBright, green, red, yellow } from "colorette";

import { getNextVersionToProcess } from "../common/versionControl";

import { SuperProcessor } from "./super-processor";

import { CoinFlipProcessor, GenericCoinFlipProcessor, GenericCoinFlipProcessorUoW } from "./coprocessors";

import { IProcessorManager, ICoprocessor, ISuperProcessor } from "./interfaces";
import { getSupportedAptosChainId } from "../common/chains";
import { errorEmitter } from "../errorHandler";
import { getMikroORM } from "../models/mikro-orm/mikro-orm.config";

export class ProcessorManager extends IProcessorManager {
  public static async run(_config: Config) {
    try {
      ProcessorManager._run(_config);
    } catch (error) {
      // NOTE: this catch is only reachable within the context of errors that fail here
      // Errors thrown in ICoprocessor.processTransactions would not caught here.
      // Above error can be simply test randomly thrown error in processTransactions
      ProcessorManager.cleanup();
    }
  }

  public static cleanup() {
    console.warn(yellow("Cleaning up ProcessorManager to allow for a re-try"));
    ProcessorManager.staleConfig = undefined;
  }

  private static async _run(_config: Config) {
    if (ProcessorManager.staleConfig) {
      throw new Error("ProcessorManager already being run");
    }

    const aptosChainId = getSupportedAptosChainId(Number(_config.chain_id));

    ProcessorManager.staleConfig = _config;
    ProcessorManager.coreConfig = {
      chain_id: _config.chain_id,
      grpc_data_stream_endpoint: _config.grpc_data_stream_endpoint,
      grpc_data_stream_api_key: _config.grpc_data_stream_api_key,
      db_connection_uri: _config.db_connection_uri,
    };

    const orm = await getMikroORM();

    // NOTE: add on coprocessors to this array as the need arises
    IProcessorManager.coprocessors = [
      new CoinFlipProcessor(aptosChainId),
      new GenericCoinFlipProcessor(aptosChainId),
      new GenericCoinFlipProcessorUoW(aptosChainId, orm),
    ];
    const allTypeormModels: (typeof Base)[] = [];

    for (const coprocessor of IProcessorManager.coprocessors) {
      allTypeormModels.push(...coprocessor.typeormModels);
    }

    const superProcessor = new SuperProcessor(aptosChainId);
    const superProcessorName = superProcessor.name();
    SuperProcessor.genesisVersion = ProcessorManager.staleConfig.starting_version;

    const staleGenericWorker = new Worker({
      config: ProcessorManager.staleConfig,
      processor: superProcessor,
      models: allTypeormModels, // we include all entities in addition to the sdk's NextVersionToProcess entity
    });

    // TODO: Aptos should incorporate the following logic into "@aptos-labs/aptos-processor-sdk"
    // we get the last processed version if any and use that as the starting_version
    // nstead of re-indexing from SuperProcessor.genesisVersion
    const genericDataSource = staleGenericWorker.dataSource;
    await genericDataSource.initialize();
    const superProcessorNextVersionToProcess =
      (await getNextVersionToProcess(genericDataSource, superProcessorName)) || SuperProcessor.genesisVersion;

    ISuperProcessor.initialNextStartingVersion = superProcessorNextVersionToProcess;
    IProcessorManager.coprocessors = await ProcessorManager.syncCoprocessorsTo(
      superProcessorNextVersionToProcess,
      SuperProcessor.genesisVersion,
      genericDataSource,
      ProcessorManager.coprocessors,
    );

    console.log(blueBright("synced coprocessors; proceeding with single super stream"));

    // at this point all valid coprocessors should be synced with the SuperProcessor
    // up to superProcessorNextVersionToProcess so we can now continue with the SuperProcessor
    SuperProcessor.readyToSuperProcess();

    const superConfig = new Config(
      ProcessorManager.coreConfig.chain_id,
      ProcessorManager.coreConfig.grpc_data_stream_endpoint,
      ProcessorManager.coreConfig.grpc_data_stream_api_key,
      superProcessorNextVersionToProcess,
      ProcessorManager.coreConfig.db_connection_uri,
    );

    const superWorker = new Worker({
      config: superConfig,
      processor: superProcessor,
      models: allTypeormModels,
    });
    await superWorker.run();
  }

  private static async syncCoprocessorsTo(
    superProcessorNextVersionToProcess: bigint,
    superProcessorGenesisVersion: bigint,
    genericDataSource: DataSource,
    coprocessors: ICoprocessor[],
  ): Promise<ICoprocessor[]> {
    const validCoprocessors: ICoprocessor[] = [];

    console.log({ superProcessorNextVersionToProcess });

    for (const coprocessor of coprocessors) {
      const name = coprocessor.name();

      const nextVersionInDB = await getNextVersionToProcess(genericDataSource, name);
      const coprocessorNextVersionToProcess = nextVersionInDB || coprocessor.genesisVersion;

      if (coprocessor.typeormModels.length === 0 && coprocessor.mikroormModels.length === 0) {
        // TODO: consider throwing errors for all other console.errors below
        throw new Error(`INVARIANT: coprocessor ${name} coprocessor.models.length === 0`);
      }
      console.log({
        nextVersionInDB,
        coprocessor_genesisVersion: coprocessor.genesisVersion,
      });
      if (coprocessorNextVersionToProcess === superProcessorNextVersionToProcess) {
        console.info(green(`coprocessor ${name} already in sync with SuperProcessor`));
        validCoprocessors.push(coprocessor);
        continue;
      }

      if (coprocessor.genesisVersion < superProcessorGenesisVersion) {
        console.error(red(`coprocessor ${name} genesisVersion is earlier than SuperProcessor genesisVersion`));
        continue;
      }

      if (nextVersionInDB === null && coprocessor.genesisVersion > superProcessorNextVersionToProcess) {
        // NOTE: since it's possible that the SuperProcessor is still before the Coprocessor's genesis
        // in which case, the SuperProcessor has to in fact catch up to the Coprocessor.
        validCoprocessors.push(coprocessor);
        continue;
      }

      if (coprocessorNextVersionToProcess > superProcessorNextVersionToProcess) {
        console.error(
          red(`INVARIANT: coprocessor ${name} coprocessorNextVersionToProcess > superProcessorNextVersionToProcess`),
        );
        continue;
      }

      const didSucceed = await this.syncCoprocessorTo(coprocessorNextVersionToProcess, coprocessor);
      if (!didSucceed) {
        console.error(red(`failed to sync ${name}; unknown reason`));
        continue;
      }
      validCoprocessors.push(coprocessor);
    }

    return validCoprocessors;
  }

  private static async syncCoprocessorTo(
    coprocessorNextVersionToProcess: bigint,
    coprocessor: ICoprocessor,
  ): Promise<boolean> {
    const name = coprocessor.name();
    try {
      console.log(blueBright(`About to sync coprocessor: ${name}`));
      const config = new Config(
        ProcessorManager.coreConfig.chain_id,
        ProcessorManager.coreConfig.grpc_data_stream_endpoint,
        ProcessorManager.coreConfig.grpc_data_stream_api_key,
        coprocessorNextVersionToProcess,
        ProcessorManager.coreConfig.db_connection_uri,
      );

      const worker = new Worker({
        config,
        processor: coprocessor,
        models: coprocessor.typeormModels,
      });

      // Start the worker without awaiting it
      worker.run();

      // Wait for the 'syncedToSuper' event
      const synced = await new Promise<boolean>((resolve, reject) => {
        const onSynced = () => {
          console.log(green(`Synced ${name} to SuperProcessor`));
          resolve(true);
        };

        // Listen for the 'syncedToSuper' event
        errorEmitter.once("syncedToSuper", onSynced);

        // Optional: Add a timeout to avoid hanging indefinitely
        // setTimeout(() => {
        //   reject(new Error("Timeout waiting for synchronization to complete."));
        // }, 60000); // 60 seconds
      });

      return synced;
    } catch (error) {
      // TODO: given the behaviour requiring the above listener
      // the following code is basically unreachable; consider removing
      if (error instanceof Error) {
        if (error.message === ICoprocessor.SYNCED_TO_SUPER_ERROR) {
          console.log(green(`Synced ${name} to SuperProcessor`));
          return true;
        }
        // Log unexpected errors for debugging
        console.error(`Unexpected error while syncing ${name}:`, error);
        throw error; // Rethrow unexpected errors
      } else {
        // Handle non-Error exceptions
        console.error(`Unknown error while syncing ${name}:`, error);
        throw error; // Rethrow unexpected non-Error objects
      }
    }
  }
}
