import { Entity, PrimaryColumn, Column } from "typeorm";

import { CommonBase } from "./common";

@Entity("coin_flip_events")
export class CoinFlipEvent extends CommonBase {
  @PrimaryColumn({ type: "bigint" })
  sequenceNumber!: string;

  @PrimaryColumn({ type: "bigint" })
  creationNumber!: string;

  @PrimaryColumn()
  accountAddress!: string;

  @Column()
  prediction!: boolean;

  @Column()
  result!: boolean;

  @Column({ type: "bigint" })
  wins!: string;

  @Column({ type: "bigint" })
  losses!: string;

  @Column({ type: "numeric", precision: 5, scale: 2 })
  winPercentage!: number;

  @Column({ type: "bigint" })
  transactionVersion!: string;

  @Column({ type: "timestamp with time zone" })
  transactionTimestamp!: Date;

  // NOTE: kinda pointless; this isn't something that is typically relevant
  @Column({ type: "bigint" })
  eventIndex!: string;
}

@Entity("coin_flip_stats")
export class CoinFlipStat extends CommonBase {
  @Column({ type: "bigint" })
  totalWins!: string;

  @Column({ type: "bigint" })
  totalLosses!: string;

  @Column({ type: "numeric", precision: 5, scale: 2 })
  winPercentage!: number;

  // NOTE: kinda pointless; this isn't something that is typically relevant
  @Column({ type: "timestamp with time zone", default: () => "CURRENT_TIMESTAMP" })
  lastUpdated!: Date;
}
