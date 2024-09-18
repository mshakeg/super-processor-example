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

import { SupportedAptosChainIds } from "../common/chains";

export abstract class ISuperProcessor extends TransactionsProcessor {
  public static initialNextStartingVersion = 0n;

  public static actuallySuperProcessing = false;

  public static genesisVersion = -1n; // NOTE: should be set to the config.yaml's starting_version

  public static readyToSuperProcess() {
    ISuperProcessor.actuallySuperProcessing = true;
  }
}

export abstract class ICoprocessor extends TransactionsProcessor {
  // - - - Singleton to all Coprocessors - - -

  public static SYNCED_TO_SUPER_ERROR = "SYNCED_TO_SUPER_ERROR";

  // - - - Specifc to a given Coprocessor - - -

  public chainId: SupportedAptosChainIds;

  constructor(chainId: SupportedAptosChainIds) {
    super();
    this.chainId = chainId;
  }

  // validation on genesisVersion:
  // - genesisVersion for a given coprocessor must be > starting_version in config.yaml
  // if genesisVersion < initialNextStartingVersion(of SuperProcessor)
  // then we want to index up to initialNextStartingVersion
  // in processTransactions if endVersion < genesisVersion, then early return
  // since it's before where we want to start indexing.
  public genesisVersion = -1n;

  // TODO: consider adding a terminationVersion; where txs beyond are no longer indexed.

  public models: (typeof Base)[] = [];

  // IMPORTANT NOTE: if a coprocessor is using the SuperProcessor's stream then the must update the nextVersionToProcess
  // so that if the service were to be restarted it would be able to discern next version to process for any coprocessor
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

  protected preProcessTransactions(params: {
    transactions: protos.aptos.transaction.v1.Transaction[];
    startVersion: bigint;
    endVersion: bigint;
  }): {
    filteredTransactions: protos.aptos.transaction.v1.Transaction[];
    containedNextStartingVersion: boolean;
  } {
    const { transactions, startVersion } = params;
    const actuallySuperProcessing = ISuperProcessor.actuallySuperProcessing;
    console.log("coprocessor:", this.name(), actuallySuperProcessing);

    if (!actuallySuperProcessing) {
      // we need to ensure that if we reach ISuperProcessor.initialNextStartingVersion that we stop
      // we also need to ensure that we do NOT exceed ISuperProcessor.initialNextStartingVersion
      if (startVersion === ISuperProcessor.initialNextStartingVersion) {
        throw new Error(ICoprocessor.SYNCED_TO_SUPER_ERROR);
      }

      if (startVersion > ISuperProcessor.initialNextStartingVersion) {
        throw new Error("FATAL: this is not expected to ever occur");
      }
    }

    let filteredTransactions: protos.aptos.transaction.v1.Transaction[] = [];
    let containedNextStartingVersion = false;

    if (actuallySuperProcessing) {
      filteredTransactions = transactions;
    } else {
      const result = this.filterTransactions(transactions, ISuperProcessor.initialNextStartingVersion);
      filteredTransactions = result.filteredTransactions;
      containedNextStartingVersion = result.containedNextStartingVersion;
    }

    return { filteredTransactions, containedNextStartingVersion };
  }

  protected async postProcessTransactions(params: {
    startVersion: bigint;
    endVersion: bigint;
    dataSource: DataSource;
    containedNextStartingVersion: boolean;
  }): Promise<ProcessingResult> {
    const { startVersion, endVersion, dataSource, containedNextStartingVersion } = params;
    const actualEndVersion = containedNextStartingVersion
      ? ISuperProcessor.initialNextStartingVersion - 1n
      : endVersion;
    // if actuallySuperProcessing we have to save checkpoint directly in coprocessor
    // as only the SuperProcessor worker is active, not each Coprocessor's
    await this.createNextVersionToProcess(dataSource, actualEndVersion);
    return this.result(startVersion, actualEndVersion);
  }
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
