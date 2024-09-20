import { SupportedAptosChainIds } from "../../common/chains";
import { AptosEvent, BaseEventData } from "../interfaces";

interface CoinFlipConfig {
  modulePublisher: string;
  genesisVersion: bigint;
}

export const CHAIN_CONFIGS: Partial<Record<SupportedAptosChainIds, CoinFlipConfig>> = {
  [SupportedAptosChainIds.APTOS_TESTNET]: {
    modulePublisher: "0xe57752173bc7c57e9b61c84895a75e53cd7c0ef0855acd81d31cb39b0e87e1d0",
    genesisVersion: 635_567_537n,
  },
  [SupportedAptosChainIds.JESTNET]: {
    // for local testing purposes
    modulePublisher: "0xe57752173bc7c57e9b61c84895a75e53cd7c0ef0855acd81d31cb39b0e87e1d0",
    genesisVersion: 635_567_537n,
  },
};

interface CoinFlipEventData extends BaseEventData {
  prediction: boolean;
  result: boolean;
  wins: string; // Use string for u64 to avoid potential precision issues
  losses: string;
}

export interface CoinFlipEvent extends AptosEvent {
  data: CoinFlipEventData;
}
