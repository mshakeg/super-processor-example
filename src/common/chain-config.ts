import { parseUnderscoreNumber } from "./formatting";
import { SUPPORTED_APTOS_CHAIN_IDS, SupportedAptosChainIds } from "./chains";

const genesisVersionBase = "GENESIS_VERSION_";

export const GENESIS_VERSIONS: Record<SupportedAptosChainIds, number | undefined> = Object.fromEntries(
  SUPPORTED_APTOS_CHAIN_IDS.map((chainId) => [
    chainId,
    process.env[`${genesisVersionBase}${chainId}`]
      ? parseUnderscoreNumber(process.env[`${genesisVersionBase}${chainId}`]!)
      : undefined,
  ]),
) as Record<SupportedAptosChainIds, number | undefined>;
