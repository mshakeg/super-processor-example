import { Base } from "@aptos-labs/aptos-processor-sdk";
import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity("coin_flip_events")
export class CoinFlipEvent extends Base {
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

  @Column({ type: "timestamp with time zone", default: () => "CURRENT_TIMESTAMP" })
  insertedAt!: Date;

  @Column({ type: "bigint" })
  eventIndex!: string;
}
