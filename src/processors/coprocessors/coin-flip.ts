import { protos, ProcessingResult } from "@aptos-labs/aptos-processor-sdk";

import { DataSource } from "typeorm";

import { ICoprocessor, ISuperProcessor } from "../interfaces";

import { CoinFlipEvent } from "../../models/coin-flip";

// TODO: make this network configurable
// might require making the chain_id part of the model/entity primary key
// if we want to be able to run multiple networks on the same DB
// the genesisVersion would also have to be network configurable
const COIN_FLIP_MODULE_PUBLISHER = "0xe57752173bc7c57e9b61c84895a75e53cd7c0ef0855acd81d31cb39b0e87e1d0";

export class CoinFlipProcessor extends ICoprocessor {
  // NOTE: this should be fixed and remain unchanged
  name(): string {
    return "coin_flip_processor";
  }

  // NOTE: this should be fixed and remain unchanged for deterministic/replicable continuity
  public genesisVersion: bigint = 635_567_537n;

  async processTransactions({
    transactions,
    startVersion,
    endVersion,
    dataSource,
  }: {
    transactions: protos.aptos.transaction.v1.Transaction[];
    startVersion: bigint;
    endVersion: bigint;
    dataSource: DataSource; // DB connection
  }): Promise<ProcessingResult> {
    // TODO: not essential but for additional dev safety load a dataSource with only the models for the coprocessor
    // instead of using the SuperProcessor's dataSource that has all models across all coprocessors

    const actuallySuperProcessing = ISuperProcessor.actuallySuperProcessing;
    console.log("coprocessor:", this.name(), actuallySuperProcessing);
    // TODO: consider early returning if [start,end] before genesisVersion for efficiency
    // However not essential since there'd be no events relevant to the coprocessor

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
    let containedNextStartingVersion: boolean = false;

    // TODO: encapsulate all logic that is common to Coprocessors in preProcessTransactions and a postProcessTransactions functions
    if (actuallySuperProcessing) {
      // since SuperProcessor filtered to keep only user txs
      filteredTransactions = transactions;
    } else {
      const {
        filteredTransactions: _filteredTransactions,
        containedNextStartingVersion: _containedNextStartingVersion,
      } = this.filterTransactions(transactions, ISuperProcessor.initialNextStartingVersion);

      filteredTransactions = _filteredTransactions;
      containedNextStartingVersion = _containedNextStartingVersion;
    }

    const eventDbObjs: CoinFlipEvent[] = [];

    for (const transaction of transactions) {
      const transactionVersion = transaction.version!.toString();
      const transactionBlockHeight = transaction.blockHeight!.toString();
      const transactionTimestamp = new Date(
        Number(transaction.timestamp!.seconds) * 1000 + Number(transaction.timestamp!.nanos) / 1e6,
      );
      const userTransaction = transaction.user!;

      if (userTransaction === undefined) {
        console.warn("TODO: investigate this intermittent issue where 'userTransaction' is undefined");
      }

      if (userTransaction.events === undefined) {
        console.warn("TODO: investigate this intermittent issue where 'events' is undefined");
      }

      userTransaction.events?.forEach((event, eventIndex) => {
        if (!this.includedEventType(event.typeStr!)) {
          return;
        }

        // TODO: add typesafety for events
        // TODO: add a switch case for the different events being handled
        // with a similar devX to subgraph handler development; use https://www.npmjs.com/package/mikro-orm
        // to work efficiently with a batch of events/transactions that may CRUD to the same DB records

        const creationNumber = event.key!.creationNumber!.toString();
        const accountAddress = event.key!.accountAddress!;
        const sequenceNumber = event.sequenceNumber!.toString();

        const data = JSON.parse(event.data!);
        const prediction = Boolean(data.prediction);
        const result = Boolean(data.result);
        const wins = BigInt(data.wins);
        const losses = BigInt(data.losses);

        const winPercentage = Number(wins) / (Number(wins) + Number(losses));

        const eventDbObj = new CoinFlipEvent();
        eventDbObj.sequenceNumber = sequenceNumber;
        eventDbObj.creationNumber = creationNumber;
        eventDbObj.accountAddress = accountAddress;
        eventDbObj.transactionVersion = transactionVersion;
        eventDbObj.transactionTimestamp = transactionTimestamp;
        eventDbObj.losses = losses.toString();
        eventDbObj.prediction = prediction;
        eventDbObj.result = result;
        eventDbObj.wins = wins.toString();
        eventDbObj.winPercentage = winPercentage;
        eventDbObj.eventIndex = eventIndex.toString();

        eventDbObjs.push(eventDbObj);
      });
    }

    // Insert events into the DB.
    await dataSource.transaction(async (txnManager) => {
      // Insert in chunks of 100 at a time to deal with this issue:
      // https://stackoverflow.com/q/66906294/3846032
      const chunkSize = 100;
      for (let i = 0; i < eventDbObjs.length; i += chunkSize) {
        const chunk = eventDbObjs.slice(i, i + chunkSize);
        await txnManager.insert(CoinFlipEvent, chunk);
      }
    });

    const actualEndVersion = containedNextStartingVersion
      ? ISuperProcessor.initialNextStartingVersion - 1n
      : endVersion;

    // if actuallySuperProcessing we have to save checkpoint directly in coprocessor
    // as only the SuperProcessor worker is active, not each Coprocessor's
    await this.createNextVersionToProcess(dataSource, actualEndVersion);
    return this.result(startVersion, actualEndVersion);
  }

  private includedEventType(eventType: string): boolean {
    const [moduleAddress, moduleName, eventName] = eventType.split("::");
    const standardizedModuleAddress = `0x${moduleAddress.slice(2).padStart(64, "0")}`;
    return (
      standardizedModuleAddress === COIN_FLIP_MODULE_PUBLISHER &&
      moduleName === "coin_flip" &&
      eventName === "CoinFlipEvent"
    );
  }

  public loadModels() {
    if (this.models.length === 0) {
      this.models = [CoinFlipEvent];
    }
  }
}
