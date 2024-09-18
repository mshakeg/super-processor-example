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

  // TODO: consider making this readonly and initialized in the constructor
  public static genesisVersion = -1n; // NOTE: should be set to the config.yaml's starting_version

  public static readyToSuperProcess() {
    ISuperProcessor.actuallySuperProcessing = true;
  }
}

export abstract class ICoprocessor extends TransactionsProcessor {
  // - - - Singleton to all Coprocessors - - -

  public static readonly SYNCED_TO_SUPER_ERROR = "SYNCED_TO_SUPER_ERROR";

  // - - - Specifc to a given Coprocessor - - -

  public readonly chainId: SupportedAptosChainIds;

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
  public static staleConfig?: Config;
  public static coreConfig: CoreConfig;
}

export interface BaseEventData {
  [key: string]: unknown;
}

export interface AptosTransaction {
  version: bigint;
  blockHeight: bigint;
  timestamp: bigint; // in unix seconds
}

export interface AptosEventID {
  moduleAddress: string;
  moduleName: string;
  eventName: string;
}

export interface AptosEvent {
  id: AptosEventID;
  sequenceNumber: bigint;
  creationNumber: bigint;
  accountAddress: string;
  eventIndex: number;
  // EventHandler function should specify the extended AptosEvent for additional type safety
  // on custom event "data", which we're guaranteed to be an object
  data: BaseEventData;
}

type EventHandler<T extends AptosEvent = AptosEvent> = (
  aptosTx: AptosTransaction,
  event: T,
  dataSource: DataSource,
) => Promise<void>;

class EventHandlerRegistry {
  private handlers: Map<string, EventHandler<AptosEvent>> = new Map();

  registerHandler<T extends AptosEvent>(eventID: AptosEventID, handler: EventHandler<T>) {
    const key = this.getEventKey(eventID);
    this.handlers.set(key, handler as EventHandler<AptosEvent>);
  }

  // NOTE: will only execute a handler for a uniquely IDed event(address::module::event) if a handler exists for it
  async handleEvent(
    aptosTx: AptosTransaction,
    rawEvent: protos.aptos.transaction.v1.Event,
    eventIndex: number,
    dataSource: DataSource,
  ): Promise<void> {
    const eventID = this.getEventID(rawEvent);
    const eventKey = this.getEventKey(eventID);
    const handler = this.handlers.get(eventKey);
    if (handler) {
      const aptosEvent = this.parseEvent(eventID, rawEvent, eventIndex);
      await handler(aptosTx, aptosEvent, dataSource);
    }
    // NOTE: logging on every event that does not have an event handler would be too verbose
  }

  private getEventID(rawEvent: protos.aptos.transaction.v1.Event): AptosEventID {
    const [moduleAddress, moduleName, eventName] = rawEvent.typeStr!.split("::");
    const standardizedModuleAddress = `0x${moduleAddress.slice(2).padStart(64, "0")}`;
    return {
      moduleAddress: standardizedModuleAddress,
      moduleName,
      eventName,
    };
  }

  private getEventKey(eventID: AptosEventID): string {
    return `${eventID.moduleAddress}::${eventID.moduleName}::${eventID.eventName}`;
  }

  private parseEvent(eventID: AptosEventID, event: protos.aptos.transaction.v1.Event, eventIndex: number): AptosEvent {
    return {
      id: eventID,
      sequenceNumber: event.sequenceNumber!,
      creationNumber: event.key!.creationNumber!,
      accountAddress: event.key!.accountAddress!,
      eventIndex,
      // TODO: for increased efficiency consider only parsing when handler exists
      data: JSON.parse(event.data!),
    };
  }
}

export abstract class GenericProcessor extends ICoprocessor {
  protected eventHandlerRegistry: EventHandlerRegistry = new EventHandlerRegistry();

  constructor(chainId: SupportedAptosChainIds) {
    super(chainId);
  }

  async processTransactions(params: {
    transactions: protos.aptos.transaction.v1.Transaction[];
    startVersion: bigint;
    endVersion: bigint;
    dataSource: DataSource;
  }): Promise<ProcessingResult> {
    const { filteredTransactions, containedNextStartingVersion } = this.preProcessTransactions(params);
    for (const transaction of filteredTransactions) {
      const aptosTx: AptosTransaction = {
        version: transaction.version!,
        blockHeight: transaction.blockHeight!,
        timestamp: transaction.timestamp?.seconds!,
      };

      const userTransaction = transaction.user!;
      if (userTransaction === undefined) {
        throw new Error("TODO: investigate this intermittent issue where 'userTransaction' is undefined");
      }

      const rawEvents: protos.aptos.transaction.v1.Event[] = userTransaction.events!;
      for (const rawEventIndex in rawEvents) {
        const rawEvent = rawEvents[rawEventIndex];
        await this.eventHandlerRegistry.handleEvent(aptosTx, rawEvent, Number(rawEventIndex), params.dataSource);
      }
    }
    return this.postProcessTransactions({ ...params, containedNextStartingVersion });
  }
}
