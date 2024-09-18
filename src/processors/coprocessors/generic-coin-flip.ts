import { DataSource } from "typeorm";
import { GenericCoinFlipEvent, GenericCoinFlipStat } from "../../models/generic-coin-flip";
import { GenericProcessor, AptosEventID, AptosTransaction } from "../interfaces";
import { SupportedAptosChainIds } from "../../common/chains";
import { CHAIN_CONFIGS, CoinFlipEvent } from "./config";

export class GenericCoinFlipProcessor extends GenericProcessor {
  private readonly COIN_FLIP_MODULE_PUBLISHER: string;
  public readonly genesisVersion: bigint;

  constructor(chainId: SupportedAptosChainIds) {
    super(chainId);
    const config = CHAIN_CONFIGS[chainId];
    if (!config) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }
    this.COIN_FLIP_MODULE_PUBLISHER = config.modulePublisher;
    this.genesisVersion = config.genesisVersion;
    this.models = [GenericCoinFlipEvent, GenericCoinFlipStat];

    // register all event handlers
    const CoinFlipEventID: AptosEventID = {
      moduleAddress: this.COIN_FLIP_MODULE_PUBLISHER,
      moduleName: "coin_flip",
      eventName: "CoinFlipEvent",
    };
    this.eventHandlerRegistry.registerHandler<CoinFlipEvent>(CoinFlipEventID, this.handleCoinFlipEvent.bind(this));
  }

  name(): string {
    return `${this.chainId}_generic_coin_flip_processor`;
  }

  private async handleCoinFlipEvent(
    aptosTx: AptosTransaction,
    event: CoinFlipEvent,
    dataSource: DataSource,
  ): Promise<void> {
    const { prediction, result, wins, losses } = event.data;

    // Create a new GenericCoinFlipEvent
    const coinFlipEvent = new GenericCoinFlipEvent();
    coinFlipEvent.chainId = this.chainId;
    coinFlipEvent.accountAddress = event.accountAddress;
    coinFlipEvent.sequenceNumber = event.sequenceNumber.toString();
    coinFlipEvent.creationNumber = event.creationNumber.toString();
    coinFlipEvent.transactionVersion = aptosTx.version.toString();
    coinFlipEvent.transactionTimestamp = new Date(Number(aptosTx.timestamp * 1000n));

    const winPercentage = Number(wins) / (Number(wins) + Number(losses));

    coinFlipEvent.prediction = prediction;
    coinFlipEvent.result = result;
    coinFlipEvent.wins = wins;
    coinFlipEvent.losses = losses;
    coinFlipEvent.winPercentage = winPercentage;
    coinFlipEvent.eventIndex = event.eventIndex.toString();

    // Update or create GenericCoinFlipStat
    let coinFlipStat = await dataSource.getRepository(GenericCoinFlipStat).findOne({
      where: { chainId: this.chainId },
    });

    if (!coinFlipStat) {
      coinFlipStat = new GenericCoinFlipStat();
      coinFlipStat.chainId = this.chainId;
      coinFlipStat.totalWins = "0";
      coinFlipStat.totalLosses = "0";
    }

    const didWin = prediction === result;

    coinFlipStat.totalWins = (BigInt(coinFlipStat.totalWins) + (didWin ? 1n : 0n)).toString();
    coinFlipStat.totalLosses = (BigInt(coinFlipStat.totalLosses) + (didWin ? 0n : 1n)).toString();
    coinFlipStat.winPercentage =
      Number(coinFlipStat.totalWins) / (Number(coinFlipStat.totalWins) + Number(coinFlipStat.totalLosses));
    coinFlipStat.lastUpdated = new Date();

    // Save the event and stats
    await dataSource.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.save(coinFlipEvent);
      await transactionalEntityManager.save(coinFlipStat);
    });
  }
}
