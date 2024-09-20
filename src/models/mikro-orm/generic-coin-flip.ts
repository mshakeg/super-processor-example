import { BigIntType, Entity, PrimaryKey, Property } from "@mikro-orm/core";
import { CommonBase } from "./common";

@Entity({ tableName: "generic_coin_flip_events_uow" })
export class GenericCoinFlipEvent extends CommonBase {
  @PrimaryKey({ type: BigIntType })
  sequenceNumber!: bigint;

  @PrimaryKey({ type: BigIntType })
  creationNumber!: bigint;

  @PrimaryKey()
  accountAddress!: string;

  @Property()
  prediction!: boolean;

  @Property()
  result!: boolean;

  @Property({ type: BigIntType })
  wins!: bigint;

  @Property({ type: BigIntType })
  losses!: bigint;

  @Property({ type: "decimal", precision: 5, scale: 2 })
  winPercentage!: number;

  @Property({ type: BigIntType })
  transactionVersion!: bigint;

  @Property()
  transactionTimestamp!: Date;

  @Property()
  eventIndex!: string;
}

@Entity({ tableName: "generic_coin_flip_stats_uow" })
export class GenericCoinFlipStat extends CommonBase {
  @Property({ type: BigIntType })
  totalWins!: bigint;

  @Property({ type: BigIntType })
  totalLosses!: bigint;

  @Property({ type: "decimal", precision: 5, scale: 2 })
  winPercentage!: number;

  @Property()
  lastUpdated: Date = new Date();
}
