import { Base, Config, Worker } from "@aptos-labs/aptos-processor-sdk";
import { DataSource } from "typeorm";

import { getNextVersionToProcess } from "../utils/versionControl";

import { SuperProcessor } from "./super-processor";

import { CoinFlipProcessor } from "./coprocessors";

import { IProcessorManager, ICoprocessor, CoreConfig } from "./interfaces";

export class ProcessorManager extends IProcessorManager {
  public static async run(_config: Config) {
    if (ProcessorManager.staleConfig) {
      throw new Error("ProcessorManager already being run");
    }

    ProcessorManager.staleConfig = _config;
    ProcessorManager.coreConfig = {
      chain_id: _config.chain_id,
      grpc_data_stream_endpoint: _config.grpc_data_stream_endpoint,
      grpc_data_stream_api_key: _config.grpc_data_stream_api_key,
      db_connection_uri: _config.db_connection_uri,
    };

    // NOTE: add on coprocessors to this array as the need arises
    IProcessorManager.coprocessors = [new CoinFlipProcessor()];
    const allModels: (typeof Base)[] = [];

    for (const coprocessor of IProcessorManager.coprocessors) {
      // TODO: consider singularly loading a dataSource for each coprocessor with only it's models here
      coprocessor.loadModels();
      allModels.push(...coprocessor.models);
    }

    const superProcessor = new SuperProcessor();
    const superProcessorName = superProcessor.name();
    SuperProcessor.genesisVersion = ProcessorManager.staleConfig.starting_version;

    const staleGenericWorker = new Worker({
      config: ProcessorManager.staleConfig,
      processor: superProcessor,
      models: allModels, // the dataSource on this worker is generic as it only has the sdk's NextVersionToProcess entity
    });

    // TODO: Aptos should incorporate the following logic into "@aptos-labs/aptos-processor-sdk"
    // we get the last processed version if any and use that as the starting_version, instead of re-indexing from SuperProcessor.genesisVersion
    const genericDataSource = staleGenericWorker.dataSource;
    await genericDataSource.initialize();
    const superProcessorNextVersionToProcess =
      (await getNextVersionToProcess(genericDataSource, superProcessorName)) || SuperProcessor.genesisVersion;

    SuperProcessor.initialNextStartingVersion = superProcessorNextVersionToProcess;
    IProcessorManager.coprocessors = await ProcessorManager.syncCoprocessorsTo(
      superProcessorNextVersionToProcess,
      SuperProcessor.genesisVersion,
      genericDataSource,
      ProcessorManager.coprocessors,
    );

    console.log("synced coprocessors; proceeding with single super stream");

    // at this point all valid coprocessors should be synced with the SuperProcessor up to superProcessorNextVersionToProcess
    // we can now continue with the SuperProcessor
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
      models: allModels,
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

    for (const coprocessor of coprocessors) {
      const name = coprocessor.name();

      const nextVersionInDB = await getNextVersionToProcess(genericDataSource, name);
      const coprocessorNextVersionToProcess = nextVersionInDB || coprocessor.genesisVersion;

      if (coprocessor.models.length === 0) {
        // TODO: consider throwing errors for all other console.errors below
        throw new Error(`INVARIANT: coprocessor ${name} coprocessor.models.length === 0`);
      }

      if (coprocessorNextVersionToProcess === superProcessorNextVersionToProcess) {
        console.info(`coprocessor ${name} already synced with SuperProcessor`);
        validCoprocessors.push(coprocessor);
        continue;
      }

      if (coprocessor.genesisVersion < superProcessorGenesisVersion) {
        console.error(`coprocessor ${name} genesisVersion is earlier than SuperProcessor genesisVersion`);
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
          `INVARIANT: coprocessor ${name} coprocessorNextVersionToProcess > superProcessorNextVersionToProcess`,
        );
        continue;
      }

      await ProcessorManager.syncCoprocessorTo(coprocessorNextVersionToProcess, coprocessor);
      validCoprocessors.push(coprocessor);
    }

    return validCoprocessors;
  }

  private static async syncCoprocessorTo(coprocessorNextVersionToProcess: bigint, coprocessor: ICoprocessor) {
    try {
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
        models: coprocessor.models,
      });
      await worker.run();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message == ICoprocessor.SYNCED_TO_SUPER_ERROR) {
          // TODO: consider checking that the coprocessor has indeed synced to SuperProcessor
          return;
        }
        throw error; // Rethrow the unexpected error
      } else {
        throw error; // Rethrow the unexpected error
      }
    }
  }
}
