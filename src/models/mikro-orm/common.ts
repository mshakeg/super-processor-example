import { PrimaryKey, Property } from "@mikro-orm/core";
import { SupportedAptosChainIds } from "../../common/chains";

// Just added for consistency with the Base typeorm entity from @aptos-labs/aptos-processor-sdk
// However none of these fields are really relevant or typically queried hence commented out.
export abstract class Base {
  //   @Property()
  //   createdAt: Date = new Date();
  //   @Property({ onUpdate: () => new Date() })
  //   updatedAt: Date = new Date();
  //   @Property({ nullable: true })
  //   deletedAt?: Date;
}

export abstract class CommonBase extends Base {
  @PrimaryKey()
  chainId!: SupportedAptosChainIds;
}
