import { DataSource } from "typeorm";
import {
  protos,
  Base,
  Config,
  createNextVersionToProcess,
  TransactionsProcessor,
  ProcessingResult,
  NextVersionToProcess,
} from "@aptos-labs/aptos-processor-sdk";

export abstract class ISuperProcessor extends TransactionsProcessor {
  public static initialNextStartingVersion: bigint = 0n;

  public static actuallySuperProcessing: boolean = false;

  public static genesisVersion: bigint = -1n; // NOTE: should be set to the config.yaml's starting_version

  public static readyToSuperProcess() {
    ISuperProcessor.actuallySuperProcessing = true;
  }
}

export abstract class ICoprocessor extends TransactionsProcessor {
  // - - - Singleton to all Coprocessors - - -

  public static SYNCED_TO_SUPER_ERROR = "SYNCED_TO_SUPER_ERROR";

  // - - - Specifc to a given Coprocessor - - -

  // if !actuallySuperProcessing && startingVersion(in Coprocessor context) == initialNextStartingVersion(in SuperProcessor
  // then set to true and throw an error, since this Coprocessor has indexed up to the SuperProcessor startingVersion
  public hasIndexedUptoSuperProcessor: boolean = false;

  // validation on genesisVersion:
  // - genesisVersion for a given coprocessor must be > starting_version in config.yaml
  // if genesisVersion < initialNextStartingVersion(of SuperProcessor) then we want to index up to initialNextStartingVersion
  // in processTransactions if endVersion < genesisVersion, then early return, since it's before where we want to start indexing.
  public genesisVersion: bigint = -1n;

  // TODO: consider adding a terminationVersion; where txs beyond are no longer indexed.

  public models: (typeof Base)[] = [];

  // IMPORTANT NOTE: if a coprocessor is using the SuperProcessor's stream then the must update the nextVersionToProcess
  // so that if the service were to be restarted it would be able to discern next version to process for any of the supported coprocessors
  public async createNextVersionToProcess(dataSource: DataSource, endVersion: bigint) {
    if (ISuperProcessor.actuallySuperProcessing) {
      await dataSource.transaction(async (txnManager) => {
        const nextVersionToProcess = createNextVersionToProcess({
          indexerName: this.name(),
          version: endVersion + 1n,
        });
        await txnManager.upsert(NextVersionToProcess, nextVersionToProcess, ["indexerName"]);
      });
    }
  }

  public filterTransactions(
    allTransactions: protos.aptos.transaction.v1.Transaction[],
    initialNextStartingVersion: bigint,
  ): {
    filteredTransactions: protos.aptos.transaction.v1.Transaction[];
    containedNextStartingVersion: boolean;
  } {
    let containedNextStartingVersion = false;
    const filteredTransactions: protos.aptos.transaction.v1.Transaction[] = [];
    // Process transactions.
    for (const transaction of allTransactions) {
      // Filter out all transactions that are not User Transactions
      if (transaction.type != protos.aptos.transaction.v1.Transaction_TransactionType.TRANSACTION_TYPE_USER) {
        continue;
      }

      if (transaction.version! >= initialNextStartingVersion) {
        // since txs are ordered as soon as we exceed the SuperProcessor.initialNextStartingVersion we breakout
        containedNextStartingVersion = true;
        break;
      }

      filteredTransactions.push(transaction);
    }
    return {
      filteredTransactions,
      containedNextStartingVersion,
    };
  }

  public async result(startVersion: bigint, endVersion: bigint): Promise<ProcessingResult> {
    return {
      startVersion,
      endVersion,
    };
  }

  abstract loadModels(): void;
}

export interface CoreConfig {
  chain_id: bigint;
  grpc_data_stream_endpoint: string;
  grpc_data_stream_api_key: string;
  db_connection_uri: string;
}

export abstract class IProcessorManager {
  // - - - Used Outside - - -
  public static coprocessors: ICoprocessor[];

  // - - - Used Internally - - -
  public static staleConfig: Config;
  public static coreConfig: CoreConfig;
}
