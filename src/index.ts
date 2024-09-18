import dotenv from "dotenv";
dotenv.config();

import { program } from "commander";
import { Config } from "@aptos-labs/aptos-processor-sdk";
import { ProcessorManager } from "./processors/manager";
import { getSupportedAptosChainId } from "./common/chains";
import { GRPC_API_KEYS, GRPC_DATA_STREAM_ENDPOINTS } from "./common/services";
import { GENESIS_VERSIONS } from "./common/chain-config";
import { blueBright, green, red, yellowBright } from "colorette";
import { ICoprocessor } from "./processors/interfaces";
import { errorEmitter } from "./errorHandler";

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

const MAX_RETRIES = 6; // max retries for ProcessorManager.run

// Handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  if (error.message === ICoprocessor.SYNCED_TO_SUPER_ERROR) {
    console.log(green(`Synced to SuperProcessor successfully.`));
    errorEmitter.emit("syncedToSuper"); // Emit the event
    // Do NOT exit the process
  } else {
    console.error(red(`Uncaught Exception: ${error.message}`));
    errorEmitter.emit("miscError", error); // Emit all other errors
    // Do NOT exit the process
  }
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason: any) => {
  if (reason instanceof Error) {
    if (reason.message === ICoprocessor.SYNCED_TO_SUPER_ERROR) {
      console.log(green(`Synced to SuperProcessor successfully.`));
      errorEmitter.emit("syncedToSuper"); // Emit the event
      // Do NOT exit the process
    } else {
      console.error(red(`Unhandled Rejection: ${reason.message}`));
      errorEmitter.emit("miscError", reason); // Emit all other errors
      // Do NOT exit the process
    }
  } else {
    console.error(red(`Unhandled Rejection: ${reason}`));
    errorEmitter.emit("miscError", new Error(reason)); // Emit all other rejections
    // Do NOT exit the process
  }
});

/**
 * Main function to start the processor with retries.
 * Listens for globally captured errors and retries accordingly.
 * @param {Config} indexerConfig - The configuration to use.
 */
async function runProcessorWithRetries(indexerConfig: Config) {
  let retries = 0;
  let success = false;

  // A promise-based function to listen for emitted errors
  const errorPromise = () => {
    return new Promise<void>((resolve, reject) => {
      // Listen for errors emitted via the errorEmitter
      errorEmitter.once("miscError", (error: Error) => {
        console.error(red(`Global error captured: ${error.message}`));
        reject(error); // Reject the promise to trigger retry
      });

      // TODO: Is this syncedToSuper listener really needed? Remove if not.
      // Listen for the 'syncedToSuper' event, which indicates success
      errorEmitter.once("syncedToSuper", () => {
        console.log(green(`Synced to SuperProcessor successfully.`));
        resolve(); // Resolve the promise to indicate success
      });
    });
  };

  while (retries < MAX_RETRIES && !success) {
    try {
      console.log(yellowBright(`Attempting to start processor (try ${retries + 1}/${MAX_RETRIES})...`));

      ProcessorManager.cleanup();
      // Run the ProcessorManager and simultaneously listen for errors
      await Promise.all([ProcessorManager.run(indexerConfig), errorPromise()]);

      success = true; // If no error, mark as success and break out of the loop
    } catch (error) {
      retries += 1;

      if (retries >= MAX_RETRIES) {
        console.error(red(`Max retries reached (${MAX_RETRIES}). Exiting process.`));
        process.exit(1); // Exit if retries exceeded
      } else {
        console.log(blueBright(`Retrying... (${retries}/${MAX_RETRIES})`));
        await sleep(3000); // Optional delay before retrying (3 seconds)
      }
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      await runProcessorWithRetries(indexerConfig);
    } catch (error) {
      console.log(red("main error"));
      console.error(error);
      process.exit(1);
    }
  });

// Parse the command-line arguments
program.parse(process.argv);
