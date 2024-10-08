import { Base } from "@aptos-labs/aptos-processor-sdk";
import { SupportedAptosChainIds } from "../../common/chains";
import { PrimaryColumn } from "typeorm";

export abstract class CommonBase extends Base {
  @PrimaryColumn()
  chainId!: SupportedAptosChainIds;
}
