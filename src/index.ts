import { program } from "commander";
import { Config } from "@aptos-labs/aptos-processor-sdk";
import { ProcessorManager } from "./processors/manager";

type Args = {
  config: string;
  perf: number;
};

program
  .command("process")
  .requiredOption("--config <config>", "Path to a yaml config file")
  .action(async (args: Args) => {
    await main(args);
  });

async function main({ config: configPath }: Args) {
  const staleConfig = Config.from_yaml_file(configPath);
  // NOTE: config "starting_version" should be fixed and remain unchanged for deterministic/replicable continuity
  await ProcessorManager.run(staleConfig);
}

program.parse();
