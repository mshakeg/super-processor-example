import { SUPPORTED_APTOS_CHAIN_IDS, SupportedAptosChainIds } from "./chains";

export const GRPC_DATA_STREAM_ENDPOINTS: Record<SupportedAptosChainIds, string> = {
  [SupportedAptosChainIds.APTOS_MAINNET]: "grpc.mainnet.aptoslabs.com:443",
  [SupportedAptosChainIds.APTOS_TESTNET]: "grpc.testnet.aptoslabs.com:443",
  [SupportedAptosChainIds.APTOS_DEVNET]: "grpc.devnet.aptoslabs.com:443",
};

const apiKeyBase = "GRPC_API_KEY_";

export const GRPC_API_KEYS: Record<SupportedAptosChainIds, string | undefined> = Object.fromEntries(
  SUPPORTED_APTOS_CHAIN_IDS.map((chainId) => [chainId, process.env[`${apiKeyBase}${chainId}`]]),
) as Record<SupportedAptosChainIds, string | undefined>;
