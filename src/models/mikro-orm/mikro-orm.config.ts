import { MikroORM, Options } from "@mikro-orm/core";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";

import { GenericCoinFlipEvent, GenericCoinFlipStat } from "./generic-coin-flip";
import { getMikroOrmPostgresDbConnectionUri } from "../../common/connection";
import { green, yellow } from "colorette";

const pgMikroORMconfig: Options<PostgreSqlDriver> = {
  entities: [GenericCoinFlipEvent, GenericCoinFlipStat], // NOTE: add on mikro-orm entities as needed
  clientUrl: getMikroOrmPostgresDbConnectionUri(),
  debug: process.env.NODE_ENV !== "production",
  driver: PostgreSqlDriver,
  schemaGenerator: {
    // NOTE: we use 2 separate DBs(1 for typeorm and 1 for mikro-orm) for increased isolation
    // so that mikro-orm doesn't drop/modify tables from the typeorm DB
    ignoreSchema: ["hdb_catalog", "hdb_views"], // Ignore Hasura schemas
  },
};

let mikroORM: MikroORM;

export async function getMikroORM() {
  try {
    if (mikroORM) {
      return mikroORM;
    } else {
      mikroORM = await MikroORM.init<PostgreSqlDriver>(pgMikroORMconfig);
      console.log(green("MikroORM initialized successfully"));
      const generator = mikroORM.getSchemaGenerator();
      console.log(yellow("about to update mikroORM DB Schema"));
      await generator.updateSchema();
      console.log(green("updated mikroORM DB Schema"));
      return mikroORM;
    }
  } catch (error) {
    console.error("Error initializing MikroORM:", error);
    throw error;
  }
}
