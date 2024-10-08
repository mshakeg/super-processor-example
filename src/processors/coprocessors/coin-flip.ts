import { protos, ProcessingResult } from "@aptos-labs/aptos-processor-sdk";

import { DataSource } from "typeorm";

import { ICoprocessor } from "../interfaces";

import { CoinFlipEvent, CoinFlipStat } from "../../models/typeorm/coin-flip";
import { SupportedAptosChainIds } from "../../common/chains";
import { CHAIN_CONFIGS } from "./config";

export class CoinFlipProcessor extends ICoprocessor {
  private COIN_FLIP_MODULE_PUBLISHER: string;

  constructor(chainId: SupportedAptosChainIds) {
    const config = CHAIN_CONFIGS[chainId];
    const baseName = "coin_flip_processor";
    if (!config) {
      const name = ICoprocessor.constructName(chainId, baseName);
      throw new Error(`${name} unsupported on chain: ${chainId}`);
    }
    super(chainId, config?.genesisVersion, baseName);
    this.COIN_FLIP_MODULE_PUBLISHER = config.modulePublisher;
    this.typeormModels = [CoinFlipEvent, CoinFlipStat];
  }

  async processTransactions(params: {
    transactions: protos.aptos.transaction.v1.Transaction[];
    startVersion: bigint;
    endVersion: bigint;
    dataSource: DataSource;
  }): Promise<ProcessingResult> {
    // TODO: not essential but for additional dev safety load a dataSource with only the models for the coprocessor
    // instead of using the SuperProcessor's dataSource that has all models across all coprocessors
    // TODO: consider early returning if [start,end] before genesisVersion for efficiency
    // However not essential since there'd be no events relevant to the coprocessor
    const { startVersion, endVersion, dataSource } = params;

    const { filteredTransactions, containedNextStartingVersion } = this.preProcessTransactions(params);

    const eventDbObjs: CoinFlipEvent[] = [];
    let totalWins = BigInt(0);
    let totalLosses = BigInt(0);

    for (const transaction of filteredTransactions) {
      const transactionVersion = transaction.version!.toString();
      const transactionBlockHeight = transaction.blockHeight!.toString();
      const transactionTimestamp = new Date(
        Number(transaction.timestamp!.seconds) * 1000 + Number(transaction.timestamp!.nanos) / 1e6,
      );
      const userTransaction = transaction.user!;

      if (userTransaction === undefined) {
        throw new Error("TODO: investigate this intermittent issue where 'userTransaction' is undefined");
      }

      userTransaction.events?.forEach((event, eventIndex) => {
        if (!this.includedEventType(event.typeStr!)) {
          return;
        }

        // TODO: add a switch case for the different events being handled
        // with a similar dev experience to a subgraph handler development, however importantly it should
        // work efficiently with a batch of events/transactions that may CRUD to the same DB records
        // instead of doing the CRUD operations for each event/tx one at a time, do them all in a batch.

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
        eventDbObj.chainId = this.chainId;
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

        // accumulate total wins/losses for current tx batch/stream accordingly
        if (prediction === result) {
          totalWins++;
        } else {
          totalLosses++;
        }
      });
    }

    // TODO: consider only updating DB if any thing to update
    // Insert events and update stats in the DB
    await dataSource.transaction(async (txnManager) => {
      // Insert in chunks of 100 at a time to deal with this issue:
      // https://stackoverflow.com/q/66906294/3846032
      const chunkSize = 100;
      for (let i = 0; i < eventDbObjs.length; i += chunkSize) {
        const chunk = eventDbObjs.slice(i, i + chunkSize);
        await txnManager.insert(CoinFlipEvent, chunk);
      }

      // Update global stats
      const statsRepository = txnManager.getRepository(CoinFlipStat);
      let stats = await statsRepository.findOne({ where: { chainId: this.chainId } });

      if (!stats) {
        stats = new CoinFlipStat();
        stats.chainId = this.chainId;
        stats.totalWins = "0";
        stats.totalLosses = "0";
      }

      stats.totalWins = (BigInt(stats.totalWins) + totalWins).toString();
      stats.totalLosses = (BigInt(stats.totalLosses) + totalLosses).toString();
      stats.winPercentage = Number(stats.totalWins) / (Number(stats.totalWins) + Number(stats.totalLosses));
      stats.lastUpdated = new Date();

      await statsRepository.save(stats);
    });

    return this.postProcessTransactions({ startVersion, endVersion, dataSource, containedNextStartingVersion });
  }

  private includedEventType(eventType: string): boolean {
    const [moduleAddress, moduleName, eventName] = eventType.split("::");
    const standardizedModuleAddress = `0x${moduleAddress.slice(2).padStart(64, "0")}`;
    return (
      standardizedModuleAddress === this.COIN_FLIP_MODULE_PUBLISHER &&
      moduleName === "coin_flip" &&
      eventName === "CoinFlipEvent"
    );
  }
}
