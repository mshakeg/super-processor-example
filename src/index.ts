import dotenv from "dotenv";
dotenv.config();

import { program } from "commander";
import { Config } from "@aptos-labs/aptos-processor-sdk";
import { ProcessorManager } from "./processors/manager";
import { getSupportedAptosChainId } from "./common/chains";
import { GRPC_API_KEYS, GRPC_DATA_STREAM_ENDPOINTS } from "./common/services";
import { GENESIS_VERSIONS } from "./common/chain-config";

// Define the shape of command-line arguments
type Args = {
  config?: string; // Make config optional
  perf?: number; // Assuming 'perf' is an optional argument
};

// Destructure environment variables with default values if necessary
const { CHAIN_ID, DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } = process.env;

/**
 * Generates internal Config from environment variables and internal constants.
 * @returns {Config} Internal Config object.
 * @throws Will throw an error if essential environment variables or constants are missing.
 */
function generateInternalConfig(): Config {
  if (!CHAIN_ID || !DB_HOST || !DB_PORT || !DB_USERNAME || !DB_PASSWORD || !DB_NAME) {
    throw new Error("One or more required environment variables are missing.");
  }

  const aptosChainId = getSupportedAptosChainId(Number(CHAIN_ID));
  const grpcEndpoint = GRPC_DATA_STREAM_ENDPOINTS[aptosChainId];
  const grpcApiKey = GRPC_API_KEYS[aptosChainId];

  if (!grpcApiKey) {
    throw new Error("GRPC_API_KEY for CHAIN_ID is not defined");
  }

  const dbConnectionUri = `postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

  const genesisVersion = GENESIS_VERSIONS[aptosChainId];

  if (!genesisVersion) {
    throw new Error("GENESIS_VERSIONS for CHAIN_ID is not defined");
  }

  return new Config(BigInt(aptosChainId), grpcEndpoint, grpcApiKey, BigInt(genesisVersion), dbConnectionUri);
}

/**
 * Main function to start the processor.
 * @param {Config} indexerConfig - The configuration to use.
 */
async function main(indexerConfig: Config) {
  // NOTE: config "starting_version" should be fixed and remain unchanged for deterministic/replicable continuity
  await ProcessorManager.run(indexerConfig);
}

// Define the "process" command
program
  .command("process")
  .description("Start the processor service")
  .option("--config <config>", "Path to a YAML config file")
  .option("--perf <number>", "Performance setting", parseInt) // Assuming 'perf' is an optional numeric argument
  .action(async (options: Args) => {
    let indexerConfig: Config;

    if (options.config) {
      // Load configuration from the provided YAML file
      try {
        indexerConfig = Config.from_yaml_file(options.config);
        console.log(`Loaded configuration from ${options.config}`);
      } catch (error) {
        console.error(`Failed to load configuration from file: ${(error as Error).message}`);
        process.exit(1);
      }
    } else {
      // Generate internal configuration
      try {
        indexerConfig = generateInternalConfig();
        console.log("Using internal configuration from environment variables and internal constants.");
      } catch (error) {
        console.error(`Failed to generate internal configuration: ${(error as Error).message}`);
        process.exit(1);
      }
    }

    // Optionally handle the 'perf' argument if it's relevant to the configuration
    if (options.perf !== undefined) {
      // Example: Modify the config based on perf, adjust as needed
      // indexerConfig.performance = options.perf;
      console.log(`Performance setting applied: ${options.perf}`);
    }

    // Start the main processor
    try {
      await main(indexerConfig);
    } catch (error) {
      console.error(`Failed to start the processor: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Parse the command-line arguments
program.parse(process.argv);
