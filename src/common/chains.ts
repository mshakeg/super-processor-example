export enum SupportedAptosChainIds {
  JESTNET = 0, // used for jest testing
  APTOS_MAINNET = 1,
  APTOS_TESTNET = 2,
  APTOS_DEVNET = 148,
}

export const SUPPORTED_APTOS_CHAIN_IDS: SupportedAptosChainIds[] = Object.values(SupportedAptosChainIds).filter(
  (value): value is number => typeof value === "number",
);

export function isValidAptosChainId(value: number | undefined): value is SupportedAptosChainIds {
  return value !== undefined && Object.values(SupportedAptosChainIds).includes(value);
}

export function getSupportedAptosChainId(value: number | undefined): SupportedAptosChainIds {
  const isValid = isValidAptosChainId(value);
  if (isValid) {
    return value as SupportedAptosChainIds;
  }
  throw new Error(`Aptos chainId ${value} is invalid`);
}
