const {
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_PORT_TYPEORM,
  DB_PORT_MIKROORM,
  DB_NAME_TYPEORM,
  DB_NAME_MIKROORM,
  DB_USERNAME,
  DB_PASSWORD,
} = process.env;

export function getPostgresDbConnectionUri(): string {
  if (!DB_HOST || !DB_PORT || !DB_USERNAME || !DB_PASSWORD || !DB_NAME) {
    throw new Error("One or more required environment variables are missing.");
  }
  return `postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

// NOTE: the following 2 functions are unused, but maybe helpful if separate DBs are used for typeorm and mikro-orm
// For increased isolation to avoid potential entity collisions, etc. Though this can also be mitigated in TS
export function getTypeormPostgresDbConnectionUri(): string {
  if (!DB_HOST || !DB_PORT_TYPEORM || !DB_USERNAME || !DB_PASSWORD || !DB_NAME_TYPEORM) {
    throw new Error("One or more required environment variables are missing.");
  }
  return `postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT_TYPEORM}/${DB_NAME_TYPEORM}`;
}

export function getMikroOrmPostgresDbConnectionUri(): string {
  if (!DB_HOST || !DB_PORT_MIKROORM || !DB_USERNAME || !DB_PASSWORD || !DB_NAME_MIKROORM) {
    throw new Error("One or more required environment variables are missing.");
  }
  return `postgresql://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT_MIKROORM}/${DB_NAME_MIKROORM}`;
}
