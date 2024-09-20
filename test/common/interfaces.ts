import { MikroORM, EntityManager } from "@mikro-orm/core";
import { SqliteDriver } from "@mikro-orm/sqlite";
import { SupportedAptosChainIds } from "src/common/chains";
import { AptosEvent, AptosEventID, AptosTransaction, GenericProcessorUoW } from "src/processors/interfaces";
import { Base as MikroOrmBase } from "src/models/mikro-orm/common";

export class GenericProcessorUoWTestHelper<T extends GenericProcessorUoW> {
  private orm: MikroORM;
  private processor: T;

  private versionCounter = 0n;
  private sequenceCounter = 0n;
  private creationCounter = 0n;
  private eventIndexCounter = 0;
  private timestampCounter = BigInt(Date.now());

  private constructor(orm: MikroORM, processor: T) {
    this.orm = orm;
    this.processor = processor;
  }

  public static async create<T extends GenericProcessorUoW>(
    ProcessorClass: new (chainId: SupportedAptosChainIds, orm: MikroORM) => T,
    entities: (typeof MikroOrmBase)[],
  ): Promise<GenericProcessorUoWTestHelper<T>> {
    const orm = await MikroORM.init({
      entities,
      dbName: ":memory:",
      driver: SqliteDriver,
    });
    const helper = new GenericProcessorUoWTestHelper(orm, new ProcessorClass(SupportedAptosChainIds.JESTNET, orm));
    await helper.createSchema();
    return helper;
  }

  async createMockEventAndTransaction<E extends AptosEvent>(params: {
    eventID: AptosEventID;
    accountAddress: string;
    data: E["data"];
    version?: bigint;
    blockHeight?: bigint;
    timestamp?: bigint;
    sequenceNumber?: bigint;
    creationNumber?: bigint;
    eventIndex?: number;
  }): Promise<{ event: E; transaction: AptosTransaction }> {
    const { eventID, accountAddress, data } = params;

    this.versionCounter++;
    this.sequenceCounter++;
    this.creationCounter++;
    this.eventIndexCounter++;
    this.timestampCounter += 1000n; // Increment by 1 second

    const event: E = {
      id: eventID,
      sequenceNumber: params.sequenceNumber ?? this.sequenceCounter,
      creationNumber: params.creationNumber ?? this.creationCounter,
      accountAddress,
      eventIndex: params.eventIndex ?? this.eventIndexCounter,
      data,
    } as E;

    const transaction: AptosTransaction = {
      version: params.version ?? this.versionCounter,
      blockHeight: params.blockHeight ?? this.versionCounter,
      timestamp: params.timestamp ?? this.timestampCounter,
    };

    return { event, transaction };
  }

  async callEventHandler<E extends AptosEvent>(
    eventID: AptosEventID,
    event: E,
    transaction: AptosTransaction,
  ): Promise<void> {
    const em = this.orm.em.fork();
    await this.processor.callEventHandler(eventID, transaction, event, em);
    await em.flush();
  }

  resetCounters(): void {
    this.versionCounter = 0n;
    this.sequenceCounter = 0n;
    this.creationCounter = 0n;
    this.eventIndexCounter = 0;
    this.timestampCounter = BigInt(Date.now());
  }

  getRegisteredEventID(registrationIndex: number): AptosEventID {
    return this.processor.getRegisteredEventID(registrationIndex);
  }

  async getEntityManager(): Promise<EntityManager> {
    return this.orm.em.fork();
  }

  private async createSchema(): Promise<void> {
    const generator = this.orm.getSchemaGenerator();
    await generator.createSchema();
  }

  async clearDatabase(): Promise<void> {
    const generator = this.orm.getSchemaGenerator();
    await generator.dropSchema();
    await generator.createSchema();
  }
}
