import { NextVersionToProcess } from "@aptos-labs/aptos-processor-sdk";
import { DataSource } from "typeorm";

export async function getNextVersionToProcess(dataSource: DataSource, indexerName: string): Promise<bigint | null> {
  const repository = dataSource.getRepository(NextVersionToProcess);

  const latestEntity = await repository.findOne({
    where: { indexerName },
    order: { nextVersion: "DESC" },
  });

  if (latestEntity) {
    return BigInt(latestEntity.nextVersion);
  }

  return null; // Return null if no entry found
}
