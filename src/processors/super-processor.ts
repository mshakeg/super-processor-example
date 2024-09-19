import { protos, ProcessingResult } from "@aptos-labs/aptos-processor-sdk";

import { DataSource } from "typeorm";

import { IProcessorManager, ISuperProcessor } from "./interfaces";
import { SupportedAptosChainIds } from "../common/chains";

export class SuperProcessor extends ISuperProcessor {
  constructor(chainId: SupportedAptosChainIds) {
    super(chainId);
  }

  name(): string {
    return `${this.chainId}_super_processor`;
  }

  async processTransactions({
    transactions,
    startVersion,
    endVersion,
    dataSource,
  }: {
    transactions: protos.aptos.transaction.v1.Transaction[];
    startVersion: bigint;
    endVersion: bigint;
    dataSource: DataSource; // DB connection
  }): Promise<ProcessingResult> {
    console.log("processTransactions:", this.name());

    const filteredTransactions: protos.aptos.transaction.v1.Transaction[] = [];

    // Process transactions.
    for (const transaction of transactions) {
      // Filter out all transactions that are not User Transactions
      if (transaction.type != protos.aptos.transaction.v1.Transaction_TransactionType.TRANSACTION_TYPE_USER) {
        continue;
      }

      filteredTransactions.push(transaction);
    }

    const coprocessors = IProcessorManager.coprocessors;
    for (const coprocessor of coprocessors) {
      // TODO: consider executing coprocessors in parallel/concurrently
      await coprocessor.processTransactions({
        transactions: filteredTransactions,
        startVersion,
        endVersion,
        dataSource,
      });
    }
    return this.result(startVersion, endVersion);
  }

  private async result(startVersion: bigint, endVersion: bigint): Promise<ProcessingResult> {
    return {
      startVersion,
      endVersion,
    };
  }
}
