import { Entity, PrimaryKey, Property } from "@mikro-orm/core";
import { CommonBase } from "./common";

@Entity({ tableName: "generic_coin_flip_events_uow" })
export class GenericCoinFlipEvent extends CommonBase {
  @PrimaryKey()
  sequenceNumber!: string;

  @PrimaryKey()
  creationNumber!: string;

  @PrimaryKey()
  accountAddress!: string;

  @Property()
  prediction!: boolean;

  @Property()
  result!: boolean;

  @Property()
  wins!: string;

  @Property()
  losses!: string;

  @Property({ type: "decimal", precision: 5, scale: 2 })
  winPercentage!: number;

  @Property()
  transactionVersion!: string;

  @Property()
  transactionTimestamp!: Date;

  @Property()
  eventIndex!: string;
}

@Entity({ tableName: "generic_coin_flip_stats_uow" })
export class GenericCoinFlipStat extends CommonBase {
  @Property()
  totalWins!: string;

  @Property()
  totalLosses!: string;

  @Property({ type: "decimal", precision: 5, scale: 2 })
  winPercentage!: number;

  @Property()
  lastUpdated: Date = new Date();
}
