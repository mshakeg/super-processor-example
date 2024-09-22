import { EntityManager, MikroORM } from "@mikro-orm/core";
import { GenericProcessorUoW, AptosEventID, AptosTransaction } from "../interfaces";
import { SupportedAptosChainIds } from "../../common/chains";
import { GenericCoinFlipEvent, GenericCoinFlipStat } from "../../models/mikro-orm/generic-coin-flip";
import { CHAIN_CONFIGS, CoinFlipEvent } from "./config";

export class GenericCoinFlipProcessorUoW extends GenericProcessorUoW {
  private readonly COIN_FLIP_MODULE_PUBLISHER: string;

  constructor(chainId: SupportedAptosChainIds, orm: MikroORM) {
    const config = CHAIN_CONFIGS[chainId];
    const baseName = "generic_coin_flip_processor_uow";
    if (!config) {
      const name = GenericProcessorUoW.constructName(chainId, baseName);
      throw new Error(`${name} unsupported on chain: ${chainId}`);
    }
    super(chainId, config.genesisVersion, baseName, orm);
    this.COIN_FLIP_MODULE_PUBLISHER = config.modulePublisher;
    this.mikroormModels = [GenericCoinFlipEvent, GenericCoinFlipStat];
    this.registerEventHandlers();
  }

  protected registerEventHandlers(): void {
    const CoinFlipEventID: AptosEventID = {
      moduleAddress: this.COIN_FLIP_MODULE_PUBLISHER,
      moduleName: "coin_flip",
      eventName: "CoinFlipEvent",
    };
    this.eventHandlerRegistry.registerHandler<CoinFlipEvent>(CoinFlipEventID, this.handleCoinFlipEvent.bind(this));
  }

  private async handleCoinFlipEvent(aptosTx: AptosTransaction, event: CoinFlipEvent, em: EntityManager): Promise<void> {
    const { prediction, result, wins, losses } = event.data;

    const coinFlipEvent = em.create(GenericCoinFlipEvent, {
      chainId: this.chainId,
      accountAddress: event.accountAddress,
      sequenceNumber: event.sequenceNumber,
      creationNumber: event.creationNumber,
      transactionVersion: aptosTx.version,
      transactionTimestamp: new Date(Number(aptosTx.timestamp * 1000n)),
      prediction,
      result,
      wins: BigInt(wins),
      losses: BigInt(losses),
      winPercentage: Number(wins) / (Number(wins) + Number(losses)),
      eventIndex: event.eventIndex.toString(),
    });

    let coinFlipStat = await em.findOne(GenericCoinFlipStat, { chainId: this.chainId });

    if (!coinFlipStat) {
      coinFlipStat = em.create(GenericCoinFlipStat, {
        chainId: this.chainId,
        totalWins: 0n,
        totalLosses: 0n,
        winPercentage: 0, // Default to 0
        lastUpdated: new Date(), // Set to current date
      });
    }

    const didWin = prediction === result;

    coinFlipStat.totalWins = coinFlipStat.totalWins + (didWin ? 1n : 0n);
    coinFlipStat.totalLosses = coinFlipStat.totalLosses + (didWin ? 0n : 1n);
    coinFlipStat.winPercentage =
      Number(coinFlipStat.totalWins) / (Number(coinFlipStat.totalWins) + Number(coinFlipStat.totalLosses));
    coinFlipStat.lastUpdated = new Date();

    // No need to call em.persist() as MikroORM automatically tracks these entities
  }
}
